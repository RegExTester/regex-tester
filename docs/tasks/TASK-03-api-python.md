# TASK-03 — New backend: `api-python` (FastAPI)

| | |
|---|---|
| **Phase** | 1 |
| **Depends on** | TASK-02 (canonical contract) |
| **Blocks** | TASK-07, TASK-08 |
| **Runs in parallel with** | TASK-04, TASK-05, TASK-06 |
| **Plan** | [docs/plan/2026-07-25-api-contract-and-python-backend.md](../plan/2026-07-25-api-contract-and-python-backend.md) |
| **Status** | Not started |

## Context

Add a third backend implementing the v1 contract, using **FastAPI + Uvicorn** and the Python **stdlib `re`
module only**. Read `docs/open-api/regex-tester-api.v1.yaml` and `docs/design/api-contract.md` first — they
are the source of truth. Use `api-nodejs/src/` as the structural reference; mirror its layering
(index → routers → controllers/services → middleware).

**Only create files under `api-python/`. Do not modify any other project.**

## What changes

### New project layout

```
api-python/
├── requirements.txt
├── pyproject.toml                  # optional, for tooling config
├── README.md
├── .env.example
└── src/
    ├── __init__.py
    ├── main.py                     # FastAPI app, CORS, routers, exception handlers, uvicorn entry
    ├── models.py                   # Pydantic models mirroring the contract schemas
    ├── options.py                  # flag registry + bitmask → re flags mapping
    ├── routers/
    │   ├── __init__.py
    │   ├── home.py                 # GET /, GET /api/version, GET /api/capabilities
    │   └── regex.py                # POST /api/regex
    ├── services/
    │   ├── __init__.py
    │   ├── regex_processor.py      # core matching logic
    │   ├── capabilities.py         # capability document for this engine
    │   └── telemetry_service.py    # no-op stub (see Out of scope)
    └── middleware/
        ├── __init__.py
        └── request_timeout.py      # 5s HTTP timeout
```

### Endpoints

| Endpoint | Behaviour |
|---|---|
| `GET /` | `RedirectResponse(url="https://regextester.github.io/", status_code=302)` |
| `GET /api/version` | `{ engineKey: "PYTHON", engineName: "Python", contractVersion: "1.0", os, framework }` where `os` = `f"{platform.system()} {platform.release()} {platform.machine()}"` and `framework` = `f"Python {platform.python_version()}"`. Cache the payload for 24 h in memory, matching the other backends. |
| `GET /api/capabilities` | The capability document below, `Cache-Control: public, max-age=86400`. |
| `POST /api/regex` | See below. |
| `GET /openapi/v1.json` | FastAPI's generated schema, served at this exact path (set `openapi_url="/openapi/v1.json"`). |
| `GET /scalar/v1` | Interactive docs at this exact path (set `docs_url="/scalar/v1"`, or serve Scalar's CDN HTML). |

### Regex option mapping — `src/options.py`

| Bit | Name | Python `re` |
|---|---|---|
| 1 | IgnoreCase | `re.IGNORECASE` |
| 2 | Multiline | `re.MULTILINE` |
| 16 | Singleline | `re.DOTALL` |
| 32 | IgnorePatternWhitespace | `re.VERBOSE` |
| 131072 | Ascii | `re.ASCII` |
| 32768 | ShowCaptures | custom — strip before compiling, use to populate `captures` |

Every other bit (4, 8, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 65536) MUST be **ignored
silently** — never raise, never warn to the caller.

### `POST /api/regex` — `src/services/regex_processor.py`

1. Treat missing `pattern` or `text` as `""`; when `pattern` is empty return
   `{ error: None, replace: None, matches: [] }` without compiling.
2. Strip bit 32768 from the bitmask, record it as `show_captures`, translate the rest to `re` flags.
3. `re.compile(pattern, flags)`. On `re.error`, return `{ error: str(exc), replace: None, matches: [] }`
   with HTTP 200.
4. Iterate `compiled.finditer(text)`. Before each iteration check a 15-second deadline
   (`time.monotonic()`); Python's `re` has no native timeout. On expiry return
   `{ error: "The regex match timed out (exceeded 15 seconds).", replace: None, matches: [] }` with HTTP 200.
5. Guard against zero-length matches causing an infinite loop.
6. For each match build a `MatchResult`:
   - `name` = `"0"`, `index` = `m.start()`, `length` = `m.end() - m.start()`, `value` = `m.group(0)`.
   - `groups`: iterate `1..compiled.groups`. Build a reverse map from `compiled.groupindex`
     (`{index: name}`) so named groups report their name and unnamed groups report `str(i)`.
     Skip groups that did not participate (`m.group(i) is None`).
     `index`/`length` from `m.span(i)`.
   - `captures`: `None` unless `show_captures`; when set, emit a **single-element** array containing the
     group's own `{index, length, value}` — Python `re` retains only the last capture of a repeated group.
     For the `MatchResult.captures` field, emit a single-element array describing the whole match.
7. When `replace` is not `None`, also compute `compiled.sub(converted, text)` and return it in `replace`.
   Convert `$1`/`${name}` style replacements to Python's `\1`/`\g<name>` so the syntax matches the other
   engines. Escape a literal `$$` to `$`. If the replacement is invalid, put the message in `error` and
   still return `matches`.
8. Response fields are **always present**; never omit `None` values. Configure the response model /
   serializer so `exclude_none` is `False`.

### Validation — `src/models.py` + `src/main.py`

- Pydantic `Input`: `pattern: str | None = Field(default=None, max_length=512)`,
  `text: str | None = Field(default=None, max_length=1024)`,
  `replace: str | None = Field(default=None, max_length=1024)`,
  `options: int = 0`.
- Register a `RequestValidationError` handler that converts FastAPI's default 422 into
  **HTTP 400** RFC 9457 ProblemDetails:
  ```json
  {
    "type": "https://tools.ietf.org/html/rfc9110#section-15.5.1",
    "title": "One or more validation errors occurred.",
    "status": 400,
    "errors": { "pattern": ["The field pattern must be a string with a maximum length of 512."] }
  }
  ```
  Field keys must be the bare property name (`pattern`, not `body.pattern`), and every value must be an
  **array of strings**.

### Capabilities — `src/services/capabilities.py`

```jsonc
{
  "engineKey": "PYTHON",
  "engineName": "Python",
  "contractVersion": "1.0",
  "defaultOptions": 3,
  "limits": {
    "patternMaxLength": 512, "textMaxLength": 1024, "replaceMaxLength": 1024,
    "regexTimeoutMs": 15000, "requestTimeoutMs": 5000
  },
  "features": { "replace": true, "captures": "single", "namedGroups": true },
  "options": [ /* every registry entry, with supported=true only for 1,2,16,32,32768,131072 */ ]
}
```

List **all** registry flags with `supported: false` for the ones Python ignores, so the frontend can grey
them out rather than hide them. `flag` is `null` for every Python option (Python has no inline flag letters
exposed to the user) except where a natural single-letter equivalent exists — prefer `null` throughout for
consistency with the .NET engine.

### Middleware and configuration

- `src/middleware/request_timeout.py`: 5-second timeout applied to `/api/regex`. On expiry return
  **HTTP 200** with `{ "error": "The request timed out (exceeded 5 seconds).", "replace": null, "matches": [] }`.
- CORS via `fastapi.middleware.cors.CORSMiddleware`: always allow `https://regextester.github.io`;
  add comma-separated origins from the `ALLOW_CORS` env var; allow any `http(s)://localhost[:port]` origin
  when `ENVIRONMENT=development`. Methods `GET, POST, OPTIONS`; headers `Content-Type`.
- Port from `PORT`, default **5200**.
- `.env.example` documents `PORT`, `ENVIRONMENT`, `ALLOW_CORS`, `COSMOS_CONNECTION_STRING`,
  `COSMOS_DATABASE`, `COSMOS_CONTAINER`.
- `README.md`: install (`pip install -r requirements.txt`), run
  (`python -m uvicorn src.main:app --reload --port 5200`), and the endpoint list.

### Dependencies — `requirements.txt`

Pin major versions: `fastapi`, `uvicorn[standard]`, `pydantic` v2. Nothing else unless strictly needed;
in particular **do not** add the third-party `regex` package.

## Out of scope

- Do not modify `api-dotnet/`, `api-nodejs/`, `ui-vuejs/`, `CLAUDE.md`, or `.github/`.
- `telemetry_service.py` is a **no-op stub only** — matching interface, no Cosmos SDK dependency,
  no network calls.
- Deployment workflow and design doc are TASK-08.
- Frontend engine registration is TASK-07.

## Acceptance criteria

- [ ] `pip install -r api-python/requirements.txt` succeeds in a clean venv.
- [ ] `python -m uvicorn src.main:app --port 5200` starts from the `api-python/` directory with no errors.
- [ ] `GET /` returns 302 with `Location: https://regextester.github.io/`.
- [ ] `GET /api/version` returns all five fields with `engineKey": "PYTHON"`.
- [ ] `GET /api/capabilities` returns the document above with a `Cache-Control` max-age of 86400.
- [ ] `GET /openapi/v1.json` returns 200 and includes the `/api/regex` path.
- [ ] `GET /scalar/v1` returns 200 HTML.
- [ ] `POST /api/regex` with `{"pattern":"\\d+","text":"a1b22c","options":0}` returns two matches
      at indices 1 and 3 with values `1` and `22`, `error: null`, `replace: null`.
- [ ] Named groups: `{"pattern":"(?<y>\\d{4})-(?<m>\\d{2})","text":"2026-07"}` returns one match whose
      `groups` are named `y` and `m` with correct `index`/`length`/`value`.
- [ ] `ShowCaptures` off → every `captures` field is `null`. `ShowCaptures` on (option bit 32768) →
      `captures` is a single-element array on the match and on each group.
- [ ] Unsupported bits are ignored: `{"pattern":"a","text":"A","options":4096}` returns 200 with no error;
      `options: 4097` behaves identically to `options: 1` (case-insensitive match).
- [ ] Invalid pattern `([` returns **HTTP 200** with `error` non-null and `matches: []`.
- [ ] `pattern` of 513 characters returns **HTTP 400** with an RFC 9457 body whose
      `errors.pattern` is an array of strings.
- [ ] Omitting `options` entirely is accepted and treated as `0`.
- [ ] Replace: `{"pattern":"(\\w+) (\\w+)","text":"hello world","replace":"$2 $1"}` returns
      `replace: "world hello"`.
- [ ] Every response body includes `error`, `replace`, and `matches` keys even when null —
      confirm no key is omitted.
- [ ] `matches` is `[]` (never `null`) in the error, timeout, and no-match cases.
- [ ] No file outside `api-python/` is created or modified.

## Report back

The file list, the exact `requirements.txt` pins, the outcome of each acceptance check, and any contract
ambiguity you had to resolve.
