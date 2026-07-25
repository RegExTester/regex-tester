// Thin fetch wrapper bound to BASE_URL. Fails fast with a clear message when
// BASE_URL is not set, since every spec file imports this module.

const BASE_URL = process.env['BASE_URL'];

function isAbsoluteUrl(value) {
  try {
    // eslint-disable-next-line no-new
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

if (!BASE_URL || !isAbsoluteUrl(BASE_URL)) {
  throw new Error(
    'BASE_URL environment variable is required and was not set to a valid absolute URL.\n' +
      'Point it at a running backend before running the suite, e.g. (PowerShell):\n' +
      "  $env:BASE_URL = 'http://localhost:5100'; npm test\n" +
      'or use one of the provided scripts: npm run test:dotnet | test:nodejs | test:python'
  );
}

function toUrl(pathname) {
  return new URL(pathname, BASE_URL).toString();
}

/**
 * Issue an arbitrary HTTP request against BASE_URL. Redirects are never
 * followed automatically so redirect responses can be asserted directly.
 */
export async function request(pathname, init = {}) {
  return fetch(toUrl(pathname), { redirect: 'manual', ...init });
}

/** GET helper. */
export async function get(pathname, init = {}) {
  return request(pathname, { method: 'GET', ...init });
}

/** POST helper that JSON-encodes `body` and sets Content-Type. */
export async function post(pathname, body, init = {}) {
  return request(pathname, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    body: JSON.stringify(body),
    ...init,
  });
}

export { BASE_URL };
