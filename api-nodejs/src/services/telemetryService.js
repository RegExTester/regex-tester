import { CosmosClient } from '@azure/cosmos';
import { DefaultAzureCredential } from '@azure/identity';
import { randomUUID } from 'crypto';
import { ENGINE_KEY } from './capabilities.js';

let cosmosClient = null;
let cosmosContainer = null;

// Upper bound on initialization. Init is awaited before the server listens, so an unreachable
// endpoint would otherwise hang startup and turn a telemetry outage into a total outage.
const INIT_TIMEOUT_MS = 10_000;

/**
 * Establishes the Cosmos client, database and container. Awaited on the startup path, before the
 * server accepts connections, so the very first request is recorded rather than silently dropped.
 *
 * Authenticates with Entra ID, never an account key: `DefaultAzureCredential` resolves the App
 * Service managed identity in Azure and the developer's `az login` session locally. A rotated key
 * silently disabled telemetry for five weeks in 2026-07; there is now no key.
 *
 * Never rejects: telemetry is non-essential, and a rejection escaping an awaited top-level call
 * would abort the whole process on startup. A bad or unreachable endpoint, a missing role
 * assignment or an unavailable credential is logged and leaves telemetry disabled for the lifetime
 * of the process.
 *
 * Resolves after at most `INIT_TIMEOUT_MS` even if Cosmos has not answered. The SDK ignores
 * `abortSignal` in the `RequestOptions` of its calls — measured against a blackholed address, it
 * still ran to the OS connect timeout of ~21 s — so the bound has to be enforced here. A connection
 * that completes after the bound still publishes its client: it is perfectly usable, it just missed
 * the startup window.
 */
async function initCosmos(endpoint, database, container) {
  if (!endpoint || cosmosClient) return;

  const connect = (async () => {
    try {
      const client = new CosmosClient({ endpoint, aadCredentials: new DefaultAzureCredential() });
      const cont = client.database(database).container(container);

      // database()/container() only build client-side handles, so without this read the first
      // token acquisition — and any 403 from a missing role assignment — would be deferred to the
      // first write and lost in its catch. One metadata round trip here proves the identity can
      // reach the container, and is covered by the readMetadata action of Cosmos DB Built-in Data
      // Contributor. It replaces the two createIfNotExists calls, which that role deliberately
      // cannot perform: creating a database or container is a control-plane operation. The
      // container is provisioned by DEPLOYMENT.md §2 and must already exist, partitioned on
      // /timestamp.
      await cont.read();

      // Published only once the round trip succeeded, so a partially initialized client is never
      // visible to sendTelemetry.
      cosmosClient = client;
      cosmosContainer = cont;
    } catch (err) {
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
  if (!cosmosClient || !cosmosContainer) return;

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

  cosmosContainer.items.create(item).catch(err => {
    console.warn('Telemetry write failed:', err.message);
  });
}

export const telemetryService = { initCosmos, sendTelemetry };

