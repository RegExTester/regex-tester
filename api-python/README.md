# RegEx Tester API — Python

FastAPI + Uvicorn backend implementing the [canonical v1 API contract](../docs/open-api/regex-tester-api.v1.yaml)
using the Python stdlib `re` module only (no third-party `regex` package).

## Install

```bash
python -m venv .venv
.venv\Scripts\Activate.ps1   # PowerShell; use `source .venv/bin/activate` on macOS/Linux
pip install -r requirements.txt
```

## Run

```bash
python -m uvicorn src.main:app --reload --port 5200
```

The server listens on `http://localhost:5200` by default (override with the `PORT` env var).

## Endpoints

| Endpoint | Description |
|---|---|
| `GET /` | 302 redirect to the hosted frontend. |
| `GET /api/version` | Engine and runtime version information. |
| `GET /api/capabilities` | Options, limits, and features this engine supports. |
| `POST /api/regex` | Run a regular expression against input text. |
| `GET /openapi/v1.json` | This engine's generated OpenAPI schema. |
| `GET /scalar/v1` | Interactive API docs. |

## Configuration

See [.env.example](.env.example) for `PORT`, `ENVIRONMENT`, `ALLOW_CORS`, and the (currently unused)
Cosmos DB telemetry settings.

## Limits

- Request body size is capped at **8192 bytes** (`maxRequestBodyBytes` in `GET /api/capabilities`).
  A body exceeding this limit — whether declared via `Content-Length` or discovered while streaming
  a request with no (or an understated) `Content-Length`, e.g. chunked transfer-encoding — is
  rejected with **HTTP 413** and an RFC 9457 `ProblemDetails` JSON body, without buffering the full
  body in memory.
- Field-level limits (`pattern` ≤ 512, `text` ≤ 1024, `replace` ≤ 1024 characters) within an
  otherwise valid-sized body return **HTTP 400** `ProblemDetails` as before.
