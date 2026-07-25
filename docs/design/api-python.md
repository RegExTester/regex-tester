# api-python — Design Document

## 1. Overview

FastAPI/Uvicorn backend for the RegEx Tester application. Implements the [canonical v1 API
contract](api-contract.md) using only the Python standard library `re` module (no third-party
`regex` package), providing the same endpoints and response shapes as `api-dotnet` and
`api-nodejs`.

## 2. Technology Stack

- **Runtime**: Python >= 3.11 (targets 3.13 in CI/deploy)
- **Framework**: FastAPI (Starlette + Pydantic v2)
- **Server**: Uvicorn (ASGI)
- **API Docs**: FastAPI's built-in OpenAPI generation, served with Scalar-compatible routes
- **Dependencies**: `fastapi`, `uvicorn[standard]`, `pydantic` (see `requirements.txt`)

## 3. Project Structure

```
api-python/
├── src/
│   ├── main.py                     # FastAPI app: CORS, middleware, exception handlers, uvicorn entry point
│   ├── models.py                   # Pydantic request/response models mirroring the v1 contract schemas
│   ├── options.py                  # Option flag registry and bitmask -> `re` flag mapping
│   ├── routers/
│   │   ├── home.py                 # GET / (redirect), GET /api/capabilities
│   │   └── regex.py                # POST /api/regex
│   ├── services/
│   │   ├── regex_processor.py      # Core `re`-based matching/replace engine, 15s deadline
│   │   ├── capabilities.py         # Builds the GET /api/capabilities response body
│   │   └── telemetry_service.py    # Telemetry stub (currently a no-op; see §12)
│   └── middleware/
│       ├── max_body_size.py        # Enforces maxRequestBodyBytes (8192) -> HTTP 413
│       └── request_timeout.py      # 5s HTTP timeout -> HTTP 200 with error body
├── pyproject.toml
├── requirements.txt
└── README.md
```

## 4. API Endpoints

Same contract as `api-dotnet` and `api-nodejs`. See [api-contract.md](api-contract.md) and
[regex-tester-api.v1.yaml](../open-api/regex-tester-api.v1.yaml) for the full request/response
schemas.

### GET /

302 redirect to `https://regextester.github.io/`.

### GET /api/capabilities

Returns engine identity, runtime, limits, features, and the full option flag registry
(`Cache-Control: public, max-age=86400`).

```json
{
  "engineKey": "PYTHON",
  "engineName": "Python",
  "contractVersion": "1.0",
  "runtime": {
    "os": "Linux 6.5.0 x86_64",
    "framework": "Python 3.13.0"
  }
}
```

`features.captures` is `"single"` — see §12.

### POST /api/regex

Executes a Python `re` pattern against `text`. Same request/response schema as the other
backends.

```json
{
  "pattern": "(?<word>\\w+)",
  "text": "hello world",
  "replace": null,
  "options": 0
}
```

An invalid pattern or a 15-second timeout returns HTTP 200 with `error` populated and
`matches: []`. An empty or `null` `pattern` returns
`{ "error": null, "replace": null, "matches": [] }`.

### GET /openapi/v1.json and GET /scalar/v1

FastAPI serves its generated OpenAPI document at `openapi_url="/openapi/v1.json"` and its
interactive docs UI at `docs_url="/scalar/v1"` (both configured in `main.py`).

## 5. Core Service: RegexProcessor

`src/services/regex_processor.py`:

- `match(pattern, text, replace, options)` returns a `RegexResult`.
- An empty/`None` `pattern` short-circuits to `{ error: None, replace: None, matches: [] }`
  before any compilation is attempted.
- Translates `.NET`/JavaScript-style named groups `(?<name>...)` to Python's `(?P<name>...)`
  syntax before compiling (lookbehind assertions `(?<=...)`/`(?<!...)` are deliberately excluded
  from this translation).
- Converts `$1` / `${name}` / `$$` replacement tokens to Python's `\1` / `\g<name>` / `$` syntax
  so a shared `replace` string behaves consistently across engines.
- Iterates `compiled.finditer(text)`, checking a monotonic deadline every iteration; on expiry
  returns `"The regex match timed out (exceeded 15 seconds)."` with `matches: []`.
- For each match, groups that did not participate (`m.group(i) is None`) are skipped, matching
  the contract's group-reporting rules.
- Named groups report their name; numbered groups fall back to their 1-based index as a string.
- `re.error` at compile time, during iteration, or during `sub()` is caught and returned via
  `error` (never raised as an HTTP error).

## 6. Regex Options — contract flags to Python `re` mapping

| Value | Name | Python `re` flag | Notes |
|---|---|---|---|
| 1 | IgnoreCase | `re.IGNORECASE` | Supported |
| 2 | Multiline | `re.MULTILINE` | Supported |
| 4 | ExplicitCapture | — | No-op |
| 8 | Compiled | — | No-op (CPython compiles patterns internally regardless) |
| 16 | Singleline | `re.DOTALL` | Supported |
| 32 | IgnorePatternWhitespace | `re.VERBOSE` | Supported |
| 64 | RightToLeft | — | No-op |
| 256 | ECMAScript | — | No-op |
| 512 | CultureInvariant | — | No-op |
| 1024 | NonBacktracking | — | No-op |
| 2048 | HasIndices | — | No-op |
| 4096 | Global | — | No-op (this engine always returns every match; see §12 and api-contract.md §4) |
| 8192 | Unicode | — | No-op (Python 3 `str` patterns are Unicode by default) |
| 16384 | UnicodeSets | — | No-op |
| 32768 | ShowCaptures | custom, stripped | Supported — populates single-element `captures` arrays |
| 65536 | Sticky | — | No-op |
| 131072 | Ascii | `re.ASCII` | Supported |

`src/options.py` is the single source of truth for this table (`SUPPORTED_RE_FLAGS` and
`OPTION_REGISTRY`); unsupported/unknown bits are masked out and silently ignored rather than
raising.

## 7. Request Timeout

- **HTTP timeout**: 5 seconds, enforced by `RequestTimeoutMiddleware` (`src/middleware/request_timeout.py`),
  scoped to `POST /api/regex` only. On expiry, returns HTTP 200 with
  `{ "error": "The request timed out (exceeded 5 seconds).", "replace": null, "matches": [] }` —
  never HTTP 408.
- **Regex timeout**: 15 seconds, checked per-iteration in `regex_processor.match()` (Python's
  `re` has no native timeout, so this is a deadline check in the `finditer` loop rather than a
  hard interrupt).

## 8. Validation

- `pattern` ≤ 512 characters, `text` ≤ 1024 characters, `replace` ≤ 1024 characters
  (`Optional[str] = Field(max_length=...)` in `src/models.py`); `options` defaults to `0`.
- A field-level violation raises Pydantic's `RequestValidationError`, converted by a custom
  `main.py` exception handler into an HTTP 400 RFC 9457 `ProblemDetails` body with
  `errors: { field: string[] }` (FastAPI's default 422 is intentionally overridden to match the
  contract's HTTP 400 + `string[]` requirement).
- Independently of field-level validation, `MaxBodySizeMiddleware`
  (`src/middleware/max_body_size.py`) rejects any raw request body over `maxRequestBodyBytes`
  (8192 bytes) with HTTP 413 and a `ProblemDetails` JSON body, checked before the body is parsed —
  so an oversized body is always reported as 413, never 400, per `docs/design/api-contract.md`
  §4/§5. It counts bytes as they stream in via the raw ASGI `receive` callable, so it also catches
  a body whose declared (or absent) `Content-Length` understates its actual size.

## 9. CORS Configuration

Configured in `main.py` via Starlette's `CORSMiddleware`:

| Environment | Allowed origins |
|---|---|
| Always | `https://regextester.github.io`, plus any origin(s) listed in `ALLOW_CORS` (comma-separated) |
| `ENVIRONMENT` != `production` (default) | Additionally reflects `http(s)://localhost[:port]` origins via `allow_origin_regex` |
| `ENVIRONMENT=production` | Only the allow-list above — no localhost reflection |

No environment ever emits a wildcard `Access-Control-Allow-Origin: *`, per
`docs/design/api-contract.md` §4.

## 10. OpenAPI Documentation

FastAPI auto-generates the OpenAPI document from the Pydantic models and route decorators;
`main.py` configures `openapi_url="/openapi/v1.json"` and `docs_url="/scalar/v1"` (with
`redoc_url=None` to avoid serving a redundant third docs UI).

## 11. Configuration (environment variables)

| Variable | Default | Description |
|---|---|---|
| `PORT` | 5200 | HTTP listen port (used by the `uvicorn.run(...)` fallback in `main.py`'s `__main__` block) |
| `ENVIRONMENT` | `development` | `production` restricts CORS to the allow-list only (see §9); **the Azure deploy workflow sets this explicitly to `production`** — running the app any other way without setting it leaves the local-dev CORS behaviour active |
| `ALLOW_CORS` | *(empty)* | Comma-separated extra allowed CORS origins |

## 12. Key Differences from the other backends

| Aspect | api-dotnet | api-nodejs | api-python |
|---|---|---|---|
| Runtime | .NET 10.0 | Node.js 22+ | Python >= 3.11 |
| Port | 5000/5001 | 5100 | 5200 |
| Regex engine | `System.Text.RegularExpressions` | JavaScript `RegExp` | stdlib `re` |
| `features.captures` | `"multi"` — `Group.Captures` retains every capture of a repeated group | `"single"` — only the last capture per group is exposed | `"single"` — `Match.groups()` only exposes the last capture per group, so `ShowCaptures` yields a single-element `captures` array |
| Telemetry | Azure Cosmos DB | Not implemented | Stub only (`telemetry_service.py` is a no-op); Cosmos DB integration is out of scope for this backend |
| OpenAPI generation | Built-in ASP.NET OpenApi | Custom JSDoc parser | Built-in FastAPI/Pydantic generation |
| Named group syntax | `(?<name>...)` native | `(?<name>...)` native | Translated from `(?<name>...)` to `(?P<name>...)` before compiling |

## 13. Deployment

- **Platform**: Azure App Service (Linux, Python 3.13)
- **URL**: `https://regex-tester-api-python.azurewebsites.net`
- **Port**: 5200 (dev)
- **Startup command**: `python -m uvicorn src.main:app --host 0.0.0.0 --port $PORT`
- **Required app setting**: `ENVIRONMENT=production` — must be set explicitly on the App Service
  (the code default of `development` is intended for local `uvicorn` runs only; deploying without
  this setting would leave the localhost-reflecting CORS rule active in production). Set by
  `.github/workflows/deploy-api-python.yml`.
- **Deployment package**: `src/` and `requirements.txt` copied into a `deploy/` directory, with
  dependencies pip-installed directly into
  `deploy/.python_packages/lib/site-packages` (the Oryx-free layout Azure App Service's Python
  image expects), then uploaded via `azure/webapps-deploy@v3`.
