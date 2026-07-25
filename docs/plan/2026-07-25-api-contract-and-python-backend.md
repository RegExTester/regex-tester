# Plan: Shared v1 API Contract + api-python Backend

| | |
|---|---|
| **Date** | 2026-07-25 |
| **Status** | Approved — not yet implemented |
| **Goal** | Define one engine-agnostic API contract shared by all backends, add a Python backend, and make adding future backends (e.g. Rust) a drop-in exercise. |

---

## 1. Context (from discovery)

Repo `regex-tester`: 1 frontend (`ui-vuejs/`, Vue 3 + Vite 6), 2 backends (`api-dotnet/` .NET 10, `api-nodejs/` Express 5).

`ui-angular/` has been **deleted by the user**, but is still referenced in docs and C# XML doc comments.

Current endpoints per backend:

- `GET /` → 302 `https://regextester.github.io/`
- `GET /api/version`
- `POST /api/regex`
- `GET /openapi/v1.json`
- `GET /scalar/v1`

### 1.1 Stale ui-angular references

| File | Location | Issue |
|---|---|---|
| `CLAUDE.md` | lines 15, 38, 98 | project table row, command block, key-files section |
| `docs/design/ui-angular.md` | whole file | delete |
| `docs/design/ui-vuejs.md` | lines 119, 144, 154–158 | "Same layout as ui-angular", "Same algorithm as ui-angular", `## Differences from ui-angular` table |
| `api-dotnet/Controllers/HomeController.cs` | line 12 | `<summary>Redirect to the Angular frontend.</summary>` |
| `api-dotnet/Controllers/RegexController.cs` | line 28 | "Base64Url-encoded by the Angular frontend" |
| `docs/open-api/api-dotnet/RegExTester.Api.DotNet.json` | lines 18, 52 | generated from the two XML comments above |

No root `README.md` exists (only `CLAUDE.md`, `LICENSE`, and the design docs).
No `deploy-ui-angular.yml` workflow exists — only `deploy-ui-vuejs.yml`, `deploy-api-nodejs.yml`, `deploy-api-dotnet.yml`.

### 1.2 Known drift between the two existing backends

| Aspect | api-dotnet | api-nodejs |
|---|---|---|
| `/api/version` body | `{ os, framework }` (+`debug` in DEBUG builds) | `{ osDescription, frameworkDescription }` |
| null fields | omitted (`JsonIgnoreCondition.WhenWritingNull`) | emitted as `null` |
| `matches` on error | `[]` | `null` |
| validation 400 body | ASP.NET ModelState (`errors: { f: string[] }`) | ProblemDetails (`errors: { f: string }`) |
| `options` missing | required (enum) | defaults to `0` |
| HTTP timeout | 5s → HTTP 408 | 5s → HTTP 200 + error body |
| Regex timeout | 15s | 15s |
| Dev port | 5000 / 5001 | 5100 |

### 1.3 Frontend bug found

`ui-vuejs/src/config.nodejs.js` sets `API.REGEX = apiBase + '/api/version'` — should be `/api/regex`.

### 1.4 Option flag registry

| Value | Name | .NET | Node.js | Python (`re`) |
|---|---|---|---|---|
| 1 | IgnoreCase | `IgnoreCase` | `i` | `IGNORECASE` |
| 2 | Multiline | `Multiline` | `m` | `MULTILINE` |
| 4 | ExplicitCapture | `ExplicitCapture` | — | — |
| 8 | Compiled | `Compiled` | — | — |
| 16 | Singleline | `Singleline` | `s` | `DOTALL` |
| 32 | IgnorePatternWhitespace | `IgnorePatternWhitespace` | strip comments | `VERBOSE` |
| 64 | RightToLeft | `RightToLeft` | — | — |
| 128 | *reserved* | .NET internal Debug — never allocate | — | — |
| 256 | ECMAScript | `ECMAScript` | — | — |
| 512 | CultureInvariant | `CultureInvariant` | — | — |
| 1024 | NonBacktracking | `NonBacktracking` | — | — |
| 2048 | HasIndices | — | `d` | — |
| 4096 | Global | — | `g` | — |
| 8192 | Unicode | — | `u` | — |
| 16384 | UnicodeSets | — | `v` | — |
| 32768 | ShowCaptures | custom, stripped before execution | custom, stripped | custom, stripped |
| 65536 | Sticky | — | `y` | — |
| **131072** | **Ascii** *(new)* | — | — | `ASCII` |

---

## 2. Decisions

1. Python stack: **FastAPI + Uvicorn**
2. Contract formality: **canonical OpenAPI spec file + language-agnostic conformance test suite**
3. Capability discovery: **add `GET /api/capabilities`**; the frontend renders option checkboxes dynamically
4. **Normalize the existing .NET and Node backends** to the new v1 contract (including the `config.nodejs.js` bug fix)
5. Python engine: **stdlib `re` only**
6. Port **5200**, deployed to Azure App Service `regex-tester-api-python.azurewebsites.net`

---

## 3. Contract v1

### 3.1 Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /` | 302 → `https://regextester.github.io/` |
| `GET /api/version` | `{ engineKey, engineName, contractVersion, os, framework }` |
| `GET /api/capabilities` | **new** — limits, defaults, and the option list this engine supports (Cache-Control 24h) |
| `POST /api/regex` | Run a regex; `{ pattern, text, replace, options }` → `{ error, replace, matches[] }` |
| `GET /openapi/v1.json` | Machine-readable spec, must match the canonical document |
| `GET /scalar/v1` | Interactive explorer |

For `/api/version`, api-nodejs keeps `osDescription` / `frameworkDescription` as deprecated aliases for one release.

### 3.2 `POST /api/regex` request

```jsonc
{
  "pattern": "string | null",  // max 512
  "text":    "string | null",  // max 1024
  "replace": "string | null",  // max 1024
  "options": 0                 // int32 bitmask, defaults to 0 when omitted
}
```

### 3.3 `POST /api/regex` 200 response

```jsonc
{
  "error": null,     // string | null
  "replace": null,   // string | null
  "matches": [
    {
      "name": "0",
      "index": 0,
      "length": 5,
      "value": "hello",
      "groups": [
        { "name": "1", "index": 0, "length": 5, "value": "hello", "captures": null }
      ],
      "captures": null
    }
  ]
}
```

### 3.4 Normalization rules baked into v1

- **All fields are always emitted** — no null omission on any backend.
- `matches` is `[]` and **never** `null`, including on error, timeout, and no-match.
- `captures` is `null` unless `ShowCaptures` (32768) is set.
- Regex compile errors and the 15s regex timeout return **HTTP 200** with `error` populated.
- Validation failure returns **HTTP 400** RFC 9457 ProblemDetails with `errors: { field: string[] }`.
- The 5s HTTP request timeout returns **HTTP 200** + `{ error: "…timed out…", replace: null, matches: [] }` (the Node behaviour wins over .NET's 408).
- **Unsupported option bits are ignored silently** — never an error — so a single bitmask stays portable across engines and shared URLs never break when switching engine.

### 3.5 `GET /api/capabilities` response

```jsonc
{
  "engineKey": "PYTHON",
  "engineName": "Python",
  "contractVersion": "1.0",
  "defaultOptions": 3,
  "limits": {
    "patternMaxLength": 512,
    "textMaxLength": 1024,
    "replaceMaxLength": 1024,
    "regexTimeoutMs": 15000,
    "requestTimeoutMs": 5000
  },
  "features": { "replace": true, "captures": "single", "namedGroups": true },
  "options": [
    { "value": 1, "name": "IgnoreCase", "flag": "i", "supported": true, "description": "…" }
  ]
}
```

---

## 4. Phases

### Phase A — Retire ui-angular
*Independent; can run immediately, in parallel with all other phases.*

1. Delete `docs/design/ui-angular.md`.
2. `CLAUDE.md` — remove the `ui-angular` table row, the `### ui-angular` command block, and the `### ui-angular Key Files` section. Reword "two frontend SPAs" to one and drop the "the frontends are interchangeable" sentence. Fold in the `api-python` additions from Phase 5 so the file is touched once.
3. `docs/design/ui-vuejs.md` — lines 119 and 144 currently depend on the deleted doc; rewrite both to be self-contained. Replace the `## Differences from ui-angular` table with a brief `## History` note.
4. `api-dotnet/Controllers/HomeController.cs` line 12 and `RegexController.cs` line 28 — change "Angular frontend" → "frontend" in the XML doc comments (these strings are baked into the generated OpenAPI description).
5. Regenerate `docs/open-api/api-dotnet/RegExTester.Api.DotNet.json`.

### Phase 0 — Define the contract
*Blocks Phases 1–4.*

1. Author `docs/open-api/regex-tester-api.v1.yaml` (OpenAPI 3.1.1) — canonical and engine-agnostic. Schemas: `Input`, `RegexResult`, `MatchResult`, `GroupResult`, `CaptureResult`, `VersionResult`, `Capabilities`, `CapabilityOption`, `ProblemDetails`.
2. Author `docs/design/api-contract.md` — narrative spec covering the flag registry (including reserved 128), error semantics, the null policy, and a "how to add a new backend (e.g. Rust)" checklist.

### Phase 1 — api-python
*Parallel with Phase 2.*

Files: `api-python/pyproject.toml` (or `requirements.txt`), `src/main.py`, `src/routers/{regex,home}.py`, `src/models.py` (Pydantic), `src/services/regex_processor.py`, `src/services/capabilities.py`, `src/middleware/request_timeout.py`, `README.md`.

- Pydantic `Input` with `max_length` constraints; a custom exception handler converts FastAPI's 422 into a 400 ProblemDetails.
- Flag map: `1→IGNORECASE, 2→MULTILINE, 16→DOTALL, 32→VERBOSE, 131072→ASCII`; `32768` stripped before execution; all other bits ignored.
- Groups: `m.groups()` plus a reverse map built from `re.groupindex` for names; index/length from `m.span(i)`; unmatched groups skipped.
- `captures`: Python `re` retains only the last capture per group, so emit a single-element array when `ShowCaptures` is set.
- 15s regex deadline enforced inside the `finditer` loop (Python `re` has no native timeout).
- `replace`: `pattern.sub(converted_replacement, text)` with `$1` → `\1` conversion for cross-engine parity.
- 5s HTTP timeout middleware; CORS from `ALLOW_CORS`; port from `PORT` (default 5200).

### Phase 2 — Normalize .NET + Node
*Parallel with Phase 1.*

- **api-dotnet** — remove null omission, return `matches: []` on error, add `/api/capabilities`, add `engineKey`/`engineName`/`contractVersion` to `/api/version`, change the 5s timeout to a 200 body instead of 408, emit ProblemDetails for validation, default `options` to 0.
- **api-nodejs** — add `os`/`framework`/`engineKey`/`engineName`/`contractVersion` to `/api/version`, return `matches: []` on error, add `/api/capabilities`, change `errors` values to `string[]`.

### Phase 3 — Conformance test suite
*Depends on Phase 0.*

`tests/contract/` — Node + vitest + ajv (2020-12) + `@apidevtools/swagger-parser`. Driven by a `BASE_URL` env var so the identical suite runs against every backend.

Cases: redirect, version, capabilities, schema validation of all responses against the canonical spec, simple match, named groups, `ShowCaptures` on/off, replace, invalid pattern → 200 + `error`, over-length pattern/text → 400 ProblemDetails, missing `options`, unknown option bits ignored, CORS preflight.

### Phase 4 — Frontend capability-driven engines
*Depends on Phases 0–2.*

1. Add `ui-vuejs/src/config.python.js`; register `PYTHON` (Index 2) in `ui-vuejs/src/config.js`.
2. Fix the `API.REGEX` bug in `ui-vuejs/src/config.nodejs.js`.
3. `RegexTester.vue` — fetch `/api/capabilities` on engine switch (cached alongside the existing 10-minute version cache) and build the option checkboxes from the response, falling back to the bundled config on failure.
4. Add `VITE_API_PYTHON` to `.env` (`http://localhost:5200`) and `.env.production` (`https://regex-tester-api-python.azurewebsites.net`).

### Phase 5 — CI/CD + docs
*Depends on Phases 1–4.*

1. `.github/workflows/deploy-api-python.yml`, modelled on `deploy-api-nodejs.yml`: paths filter, `AZURE_WEBAPP_NAME: regex-tester-api-python`, `setup-python` 3.13, pip install into a deploy directory, `azure/login@v2` + `azure/webapps-deploy@v3`, startup command `python -m uvicorn src.main:app --host 0.0.0.0 --port $PORT`.
2. `.github/workflows/contract-tests.yml` — matrix across all three backends.
3. `docs/design/api-python.md`, mirroring the `api-nodejs.md` table of contents.
4. Update `CLAUDE.md` (add the api-python row and command block) and `docs/design/ui-vuejs.md` (add the Python engine).

---

## 5. Verification

**Phase A**

1. A repo-wide case-insensitive search for `angular` returns zero matches outside `.git/`.
2. `dotnet build` in `api-dotnet/`, then confirm `/openapi/v1.json` no longer contains "Angular".

**Phases 0–5**

1. `npm run test:contract -- --url http://localhost:5000` (and `:5100`, `:5200`) — all three backends pass the identical suite.
2. Diff each backend's `/openapi/v1.json` against the canonical YAML in CI; fail on path or schema divergence.
3. Manual: run all three APIs plus `npm start` in `ui-vuejs`, switch the engine dropdown through .NET → Node.js → Python, and confirm the option checkbox list changes per engine and the shared URL round-trips (`/:pattern/:text/:options/:engine` with engine index 2).
4. Pattern `(\w)+` with `ShowCaptures` on: .NET returns multiple captures, Python and Node return a single-element array, and both validate against the spec.
5. Pattern `([` on each engine: HTTP 200, `error` non-null, `matches: []`.
6. Send `options: 4096` (JS-only Global) to .NET and Python: no error, bit ignored.

---

## 6. Scope

**In scope** — retiring all ui-angular references; the canonical contract artifacts; api-python; normalization of both existing backends; the conformance suite; the frontend Python engine and capability-driven options; CI/CD; docs.

**Out of scope** — a Rust backend; auth; rate limiting; Cosmos telemetry for api-python (stub only); changes to the Base64Url URL-sharing scheme; restoring ui-angular.

---

## 7. Open items

- Python's `re` cannot produce multiple captures per group, so there is no parity with .NET's `Captures`. This is surfaced explicitly via `features.captures = "single"` in `/api/capabilities`.
- Contract versioning: `contractVersion` is carried in `/api/version` and `/api/capabilities` so the frontend can warn on mismatch. Versioned URL paths (`/api/v2/…`) are deferred until a genuinely breaking change is needed.
