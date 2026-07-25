# RegEx Tester — cross-backend conformance suite

A single, language-agnostic HTTP test suite that validates any RegEx Tester backend
(`api-dotnet`, `api-nodejs`, `api-python`, `api-java`, or any future engine) against the canonical contract at
[docs/open-api/regex-tester-api.v1.yaml](../../docs/open-api/regex-tester-api.v1.yaml) and the
behavioural rules in [docs/design/api-contract.md](../../docs/design/api-contract.md).

The suite never talks about a specific engine. It asserts against the contract, not against
whatever a particular backend happens to return today — **a new backend is considered
contract-compliant when this suite passes unmodified against it.**

## Prerequisites

- Node.js 22+
- A backend already running and listening on some port (this suite never starts, stops, or
  otherwise manages backend processes)

## Install

```powershell
cd tests/contract
npm install
```

## Starting a backend

Run whichever backend you want to test in its own terminal, from the repository root:

```powershell
# .NET — http://localhost:5000
cd api-dotnet; dotnet run

# Node.js — http://localhost:5100
cd api-nodejs; npm install; npm start

# Python — http://localhost:5200
cd api-python; pip install -r requirements.txt; python -m uvicorn src.main:app --port 5200

# Java — http://localhost:5300
cd api-java; mvn package -DskipTests; java -jar target/app.jar
```

## Running the suite

The suite is driven entirely by the `BASE_URL` environment variable — it is **required**, has no
default, and the suite fails immediately with an actionable message if it is unset.

`BASE_URL=x npm test` is not valid PowerShell syntax, so use one of:

```powershell
# PowerShell — set the env var for the current session, then run
$env:BASE_URL = 'http://localhost:5100'; npm test

# or use one of the portable wrapper scripts (works on any OS/shell)
npm run test:dotnet   # http://localhost:5000
npm run test:nodejs   # http://localhost:5100
npm run test:python   # http://localhost:5200
npm run test:java     # http://localhost:5300
```

The wrapper scripts call `node run.js <BASE_URL>`, which sets `BASE_URL` on the child process
environment programmatically rather than relying on shell syntax, so they work unchanged on
Windows, macOS, and Linux.

The suite exits with a non-zero code if any assertion fails, making it safe to use as a CI gate.

## What is validated

Every `/api/regex` response assertion runs through a shared validator
([src/schema.js](src/schema.js)) compiled directly from the canonical OpenAPI YAML — there is no
hand-written duplicate schema anywhere in the suite. If the contract changes, the suite picks up
the new schema automatically.

| Spec | Covers |
|---|---|
| `redirect.spec.js` | `GET /` → 302 to the hosted frontend |
| `capabilities.spec.js` | `GET /api/capabilities` → `Capabilities` (incl. `runtime`), caching, flag registry invariants, and a regression check that `GET /api/version` now 404s |
| `regex-match.spec.js` | Basic matching, no-match, empty pattern |
| `regex-groups.spec.js` | Named and numbered capture groups |
| `regex-captures.spec.js` | `ShowCaptures` on/off, single-vs-multi capture engines |
| `regex-replace.spec.js` | `replace` templating and omission |
| `regex-errors.spec.js` | Invalid pattern → HTTP 200 with `error` populated |
| `validation.spec.js` | Over-length fields → HTTP 400 `ProblemDetails` |
| `options.spec.js` | Missing/zero/unknown/unsupported option bits |
| `cors.spec.js` | CORS preflight for allowed vs. disallowed origins |

The only engine-conditional branch permitted anywhere in the suite is in
`regex-captures.spec.js`, gated on `capabilities.features.captures === "multi"` — every other spec
runs identical assertions regardless of which engine is under test.

## Notes

- Regex compile errors and the 15-second regex timeout are contractually `HTTP 200` with `error`
  populated, not HTTP error responses — do not "fix" these assertions to expect an error status.
- Request validation failures (over-length `pattern`/`text`/`replace`) are `HTTP 400` RFC 9457
  `ProblemDetails`, with `errors` mapping each field to an **array** of strings, even on backends
  whose native framework only produces a single string per field.
