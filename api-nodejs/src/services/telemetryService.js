import { randomUUID } from 'node:crypto';
import { ENGINE_KEY } from './capabilities.js';

let cosmos = null;

// Upper bound on initialization. Init is awaited before the server listens, so an unreachable
// endpoint would otherwise hang startup and turn a telemetry outage into a total outage.
const INIT_TIMEOUT_MS = 10_000;

// Per-call bound on the Cosmos data-plane requests themselves.
const REQUEST_TIMEOUT_MS = 5_000;

const COSMOS_REST_API_VERSION = '2018-12-31';

// Refresh this long before the token actually expires, so an in-flight write never races expiry.
const TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;

let cachedToken = null;
let inFlightToken = null;
let devCredential = null;

/**
 * The Cosmos data plane is its own OAuth resource, identified by the account origin — no port, no
 * path. `COSMOS_ENDPOINT` carries `:443/`, which the token service rejects.
 */
function tokenResource(endpoint) {
  return `https://${new URL(endpoint).hostname}`;
}

/**
 * App Service injects IDENTITY_ENDPOINT/IDENTITY_HEADER into the container; the header proves the
 * caller is inside it. Both are absent locally, where the developer's `az login` session stands in.
 */
async function fetchManagedIdentityToken(resource) {
  const url = `${process.env.IDENTITY_ENDPOINT}?api-version=2019-08-01&resource=${encodeURIComponent(resource)}`;
  const res = await fetch(url, {
    headers: { 'X-IDENTITY-HEADER': process.env.IDENTITY_HEADER },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    // Deliberately status-only: the body can echo request details, and must never reach a log.
    throw new Error(`managed identity endpoint returned HTTP ${res.status}`);
  }
  const body = await res.json();
  return { token: body.access_token, expiresAt: parseExpiry(body.expires_on) };
}

/** `expires_on` is epoch seconds on api-version 2019-08-01 but a formatted date on some revisions. */
function parseExpiry(expiresOn) {
  const raw = String(expiresOn ?? '');
  if (/^\d+$/.test(raw)) return Number(raw) * 1000;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? Date.now() : parsed;
}

/**
 * Local-development fallback, resolving whatever the developer is signed in with — `az login`, the
 * VS Code account, or environment credentials.
 *
 * `@azure/identity` is a **devDependency**: it and `@azure/cosmos` were 12,355 of the 13,046 files
 * this project used to install, and App Service re-extracts `node_modules` on every cold start, so
 * that weight was paid on every wake-up (DEPLOYMENT.md §3). The deployed package is installed with
 * `npm ci --omit=dev` and therefore does not contain it — which is safe because Azure always
 * provides the managed identity endpoint used above. The import is dynamic so its absence in
 * production is simply never reached rather than a module-load crash.
 */
async function fetchDevCredentialToken(resource) {
  if (!devCredential) {
    let identity;
    try {
      identity = await import('@azure/identity');
    } catch {
      throw new Error(
        'no managed identity endpoint is available and @azure/identity is not installed; '
          + 'run `npm install` to get the devDependency, or set COSMOS_ENDPOINT empty to disable telemetry',
      );
    }
    devCredential = new identity.DefaultAzureCredential();
  }

  // The REST token endpoint takes a resource; the SDK takes the same value as a `/.default` scope.
  const token = await devCredential.getToken(`${resource}/.default`);
  if (!token) throw new Error('DefaultAzureCredential returned no token');
  return { token: token.token, expiresAt: token.expiresOnTimestamp };
}

/**
 * Returns a cached bearer token, refreshing shortly before expiry. Concurrent callers share one
 * in-flight request so a burst of writes cannot stampede the token service.
 */
function getToken(resource) {
  if (cachedToken && Date.now() < cachedToken.expiresAt - TOKEN_REFRESH_SKEW_MS) {
    return Promise.resolve(cachedToken.token);
  }
  if (inFlightToken) return inFlightToken;

  const useManagedIdentity = Boolean(process.env.IDENTITY_ENDPOINT && process.env.IDENTITY_HEADER);
  inFlightToken = (useManagedIdentity ? fetchManagedIdentityToken(resource) : fetchDevCredentialToken(resource))
    .then(({ token, expiresAt }) => {
      if (!token) throw new Error('token response contained no access token');
      cachedToken = { token, expiresAt };
      return token;
    })
    .finally(() => {
      inFlightToken = null;
    });

  return inFlightToken;
}

/**
 * One authenticated Cosmos data-plane call.
 *
 * The RBAC scheme is `type=aad&ver=1.0&sig=<token>`, and the whole string is URL-encoded — Cosmos
 * decodes the header before parsing it, so an unencoded `&` splits it and yields 401.
 */
async function cosmosRequest(method, path, { partitionKey, body } = {}) {
  const token = await getToken(cosmos.resource);
  const headers = {
    Authorization: encodeURIComponent(`type=aad&ver=1.0&sig=${token}`),
    'x-ms-date': new Date().toUTCString(),
    'x-ms-version': COSMOS_REST_API_VERSION,
  };
  // The SDK reads the partition key out of the document body; over REST it must be sent explicitly,
  // as a JSON array, or the write fails with a partition key mismatch.
  if (partitionKey !== undefined) {
    headers['x-ms-documentdb-partitionkey'] = JSON.stringify([partitionKey]);
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(new URL(path, cosmos.endpoint), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Cosmos ${method} ${path} returned HTTP ${res.status} ${detail.slice(0, 200)}`);
  }
  return res;
}

/**
 * Establishes the Cosmos configuration and proves the identity can reach the container. Awaited on
 * the startup path, before the server accepts connections, so the very first request is recorded
 * rather than silently dropped.
 *
 * Authenticates with Entra ID over the Cosmos REST API — no account key, and no `@azure/*` SDK in
 * the deployed package: in Azure the token comes from the App Service managed identity endpoint,
 * and `@azure/identity` is a devDependency used only for local development.
 *
 * Never rejects: telemetry is non-essential, and a rejection escaping an awaited top-level call
 * would abort the whole process on startup. A bad or unreachable endpoint, a missing role
 * assignment or an unavailable credential is logged and leaves telemetry disabled for the lifetime
 * of the process.
 */
async function initCosmos(endpoint, database, container) {
  if (!endpoint || cosmos) return;

  if (!endpoint.startsWith('https://')) {
    console.warn('COSMOS_ENDPOINT is not https; telemetry is disabled.');
    return;
  }

  cosmos = {
    endpoint: endpoint.endsWith('/') ? endpoint : `${endpoint}/`,
    resource: tokenResource(endpoint),
    docsPath: `dbs/${database}/colls/${container}/docs`,
  };

  const connect = (async () => {
    try {
      // Without this round trip the first token acquisition — and any 403 from a missing role
      // assignment — would be deferred to the first write and lost in its catch. Reading the
      // container is covered by the readMetadata action of Cosmos DB Built-in Data Contributor,
      // which deliberately cannot create anything: the container is provisioned per DEPLOYMENT.md
      // §2 and must already exist, partitioned on /timestamp.
      await cosmosRequest('GET', `dbs/${database}/colls/${container}`);
    } catch (err) {
      cosmos = null;
      console.warn('Cosmos DB telemetry initialization failed; telemetry is disabled:', err.message);
    }
  })();

  let timer;
  const bound = new Promise(resolve => {
    timer = setTimeout(() => {
      console.warn(`Cosmos DB telemetry initialization exceeded ${INIT_TIMEOUT_MS} ms; starting without it.`);
      resolve();
    }, INIT_TIMEOUT_MS);
  });

  await Promise.race([connect, bound]);
  clearTimeout(timer);
}

/**
 * Records one telemetry document for a completed `POST /api/regex` request. Fire-and-forget:
 * the Cosmos write is never awaited by the caller, and every error is swallowed here (logged at
 * warning level at most) so a Cosmos outage can never affect the HTTP response.
 *
 * @param {import('express').Request} req
 * @param {{pattern: string|null, text: string|null, replace: string|null, options: number}} model
 * @param {{durationMs: number, matchCount: number, error: string|null}} outcome
 */
function sendTelemetry(req, model, { durationMs, matchCount, error }) {
  if (!cosmos) return;

  const item = {
    id: randomUUID(),
    engineKey: ENGINE_KEY,
    timestamp: new Date().toISOString(),
    host: req.get('host') || '',
    userAgent: req.get('user-agent') || '',
    pattern: model.pattern,
    text: model.text,
    replace: model.replace ?? null,
    options: model.options ?? 0,
    durationMs,
    matchCount,
    error,
  };

  cosmosRequest('POST', cosmos.docsPath, { partitionKey: item.timestamp, body: item }).catch(err => {
    console.warn('Telemetry write failed:', err.message);
  });
}

export const telemetryService = { initCosmos, sendTelemetry };
