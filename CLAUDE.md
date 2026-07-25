# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

RegEx Tester is a mono-repo containing one frontend SPA and four backend APIs that provide real-time regex testing with match highlighting, group/capture extraction, and URL-based sharing via Base64Url encoding.

### Projects

| Project | Tech Stack | Directory |
|---------|-----------|-----------|
| **api-dotnet** | .NET 10.0 Web API | `api-dotnet/` |
| **api-nodejs** | Node.js 22+ / Express 5 | `api-nodejs/` |
| **api-python** | Python 3.13 / FastAPI | `api-python/` |
| **api-java** | Java 21 / Spring Boot 3.4 | `api-java/` |
| **ui-vuejs** | Vue 3 / Vite 6 SPA | `ui-vuejs/` |

The Vue.js frontend supports switching between all four backends at runtime via an engine dropdown, driven by each backend's `GET /api/capabilities` response.

See [README.md](README.md) for a quick start, [ARCHITECTURE.md](ARCHITECTURE.md) for the system-level
design (diagrams, cross-cutting concerns, engine divergences), and [DEPLOYMENT.md](DEPLOYMENT.md) for
the Azure/GitHub Pages deployment runbook.

## Commands

### api-dotnet

```bash
dotnet build                   # Build the project
dotnet run                     # Dev server at http://localhost:5000 / https://localhost:5001
dotnet publish -c Release      # Production publish
```

### api-nodejs

```bash
npm install                    # Install dependencies
npm start                      # Server at http://localhost:5100
npm run dev                    # Dev server with --watch
```

### api-python

```bash
pip install -r requirements.txt   # Install dependencies
python -m uvicorn src.main:app --port 5200        # Server at http://localhost:5200
python -m uvicorn src.main:app --reload --port 5200  # Dev server with reload
```

### api-java

```bash
mvn package -DskipTests        # Build; produces target/app.jar
java -jar target/app.jar       # Server at http://localhost:5300
mvn spring-boot:run            # Dev server
```

### ui-vuejs

```bash
npm start                      # Vite dev server at http://localhost:4000
npm run dev                    # Alias for npm start
npm run build                  # Production build to dist/
npm run build-prod             # Optimized production build
npm run preview                # Preview production build
```

## Architecture

### API Contract (shared by all four backends)

Every backend implements the same canonical v1 contract, so any frontend can talk to any engine
without engine-specific branching. The source of truth is
[docs/design/api-contract.md](docs/design/api-contract.md) (narrative spec) and
[docs/open-api/regex-tester-api.v1.yaml](docs/open-api/regex-tester-api.v1.yaml) (canonical
OpenAPI 3.1.1 document).

**POST /api/regex** — Run a regex and return all matches.

- Request: `{ pattern, text, replace?, options }` (pattern ≤512, text/replace ≤1024 chars, options = bitwise flags)
- Response: `{ error, replace, matches[] }` where each match has `{ name, index, length, value, groups[], captures[] }`
- All fields are always emitted (no null-omission); `matches` is `[]` (never `null`), including on error
- Regex errors and the 15-second regex timeout return in the `error` field (HTTP 200), not as HTTP error codes
- The 5-second HTTP request timeout also returns HTTP 200 with an `error`-populated body — never HTTP 408
- `ShowCaptures` flag (32768) enables capture arrays; stripped before regex execution
- Unsupported option bits are ignored silently, never rejected, so a single bitmask stays portable across engines
- An over-length field returns HTTP 400 with an RFC 9457 `ProblemDetails` body (`errors: { field: string[] }`)
- A raw request body larger than `maxRequestBodyBytes` (8192 bytes) returns **HTTP 413** with an RFC 9457
  `ProblemDetails` JSON body — checked before the body is parsed or any field's `maxLength` is validated
- An empty or `null` `pattern` returns `{ "error": null, "replace": null, "matches": [] }`

**GET /api/capabilities** — Reports engine identity, `runtime` (`os`, `framework`), limits, features, and
the full option flag registry (cached 24h) so the frontend can render option checkboxes dynamically
instead of hard-coding a list per engine. See [docs/design/api-contract.md](docs/design/api-contract.md)
for the full response shape.

**GET /** — 302 redirect to `https://regextester.github.io/`.

**CORS** — No backend ever returns `Access-Control-Allow-Origin: *`. Each allows
`https://regextester.github.io` plus a configurable allow-list, and additionally reflects
`http(s)://localhost[:port]` origins only in development.

### Request Flow

1. User types in the frontend — inputs are debounced (800ms)
2. Pattern and text are Base64Url-encoded for the shareable URL, then POSTed to `POST /api/regex`
3. Backend runs the regex match with a 15-second timeout, extracts groups/captures
4. Results are returned and rendered with match highlighting; the URL is updated for shareability

### api-dotnet Key Files

- `Controllers/RegexController.cs` — POST endpoint, model validation
- `Controllers/CapabilitiesController.cs` — GET /api/capabilities
- `Services/RegExProcessor.cs` — core regex logic with 15s timeout
- `Services/TelemetryService.cs` — optional Cosmos DB usage logging
- `Models/RegExTesterOptions.cs` — flags enum + the shared option registry mapping `RegexOptions` + `ShowCaptures`
- `Startup.cs` — CORS, DI, 5s request timeout (200 response, not 408), 413 body-too-large handling, OpenAPI (Scalar UI at `/scalar/v1`)

### api-nodejs Key Files

- `src/index.js` — Express app, CORS, routes, Swagger UI at `/scalar/v1`
- `src/controllers/regexController.js` — POST endpoint with validation
- `src/services/regexProcessor.js` — JS regex engine, flag mapping, 15s timeout, always applies `g`/`d` internally
- `src/services/capabilities.js` — GET /api/capabilities option registry and limits
- `src/middleware/requestTimeout.js` — 5s HTTP timeout
- `src/openapi.js` — auto-generates OpenAPI spec from `@openapi` JSDoc annotations
- `src/schemas.js` — OpenAPI component schemas via JSDoc

### api-python Key Files

- `src/main.py` — FastAPI app, CORS, middleware, exception handlers, uvicorn entry point
- `src/routers/regex.py` — POST /api/regex
- `src/routers/home.py` — GET /, GET /api/capabilities
- `src/services/regex_processor.py` — stdlib `re` engine, 15s deadline
- `src/services/capabilities.py` — GET /api/capabilities option registry and limits
- `src/options.py` — bitmask -> `re` flag mapping and the shared option registry
- `src/middleware/request_timeout.py` — 5s HTTP timeout
- `src/middleware/max_body_size.py` — enforces `maxRequestBodyBytes` (8192) -> HTTP 413

### api-java Key Files

- `src/main/java/io/github/regextester/api/Application.java` — Spring Boot entry point
- `src/main/java/io/github/regextester/api/controller/RegexController.java` — POST /api/regex, returns a `Callable` so the 5s async timeout applies
- `src/main/java/io/github/regextester/api/controller/HomeController.java` — GET / (302), GET /api/capabilities (24h cache)
- `src/main/java/io/github/regextester/api/controller/ApiExceptionHandler.java` — 400 validation, 413 body-too-large, 200-on-async-timeout
- `src/main/java/io/github/regextester/api/service/RegexProcessor.java` — `java.util.regex` engine, 15s deadline
- `src/main/java/io/github/regextester/api/service/TimeLimitedCharSequence.java` — deadline-checking `CharSequence` that preempts a runaway match mid-scan
- `src/main/java/io/github/regextester/api/service/CapabilitiesService.java` — GET /api/capabilities option registry and limits
- `src/main/java/io/github/regextester/api/options/RegexOptions.java` — bitmask -> `Pattern` flag mapping and the shared option registry
- `src/main/java/io/github/regextester/api/filter/MaxBodySizeFilter.java` — enforces `maxRequestBodyBytes` (8192) -> HTTP 413 before parsing
- `src/main/java/io/github/regextester/api/config/CorsConfig.java` — highest-precedence CORS filter, never `*`
- `src/main/resources/application.properties` — port 5300, 5s async timeout, springdoc paths
- `pom.xml` — `<finalName>app</finalName>` so App Service's default `java -jar app.jar` works unchanged

### ui-vuejs Key Files

- `src/components/RegexTester.vue` — main component with engine switching and capability-driven options
- `src/config.js` — registers all four engines; `src/config.dotnet.js` / `config.nodejs.js` / `config.python.js` / `config.java.js` hold per-engine bundled fallback config
- `src/utils/encodeUriHelper.js` — Base64Url encode/decode (RFC7515)
- `.env` / `.env.production` — API base URLs for .NET (port 5000), Node.js (port 5100), Python (port 5200), and Java (port 5300)

### Regex Options (bitwise flags)

128 is permanently reserved (historically .NET's internal `RegexOptions.Debug` bit) and MUST NOT
be allocated to any future flag.

| Flag | Value | .NET | Node.js | Python | Java |
|------|-------|------|---------|--------|------|
| IgnoreCase | 1 | `RegexOptions.IgnoreCase` | `i` flag | `re.IGNORECASE` | `CASE_INSENSITIVE` |
| Multiline | 2 | `RegexOptions.Multiline` | `m` flag | `re.MULTILINE` | `MULTILINE` |
| ExplicitCapture | 4 | `RegexOptions.ExplicitCapture` | no-op | no-op | no-op |
| Compiled | 8 | `RegexOptions.Compiled` | no-op | no-op | no-op |
| Singleline | 16 | `RegexOptions.Singleline` | `s` flag | `re.DOTALL` | `DOTALL` |
| IgnorePatternWhitespace | 32 | `RegexOptions.IgnorePatternWhitespace` | strip whitespace/comments | `re.VERBOSE` | `COMMENTS` |
| RightToLeft | 64 | `RegexOptions.RightToLeft` | no-op | no-op | no-op |
| *(128 reserved)* | 128 | — | — | — | — |
| ECMAScript | 256 | `RegexOptions.ECMAScript` | no-op (default) | no-op | no-op |
| CultureInvariant | 512 | `RegexOptions.CultureInvariant` | no-op | no-op | no-op |
| NonBacktracking | 1024 | `RegexOptions.NonBacktracking` | no-op | no-op | no-op |
| HasIndices | 2048 | no-op | `d` flag (always applied internally; display-only) | no-op | no-op |
| Global | 4096 | no-op | `g` flag (always applied internally; display-only) | no-op | no-op |
| Unicode | 8192 | no-op | `u` flag | no-op | `UNICODE_CHARACTER_CLASS` |
| UnicodeSets | 16384 | no-op | `v` flag | no-op | no-op |
| ShowCaptures | 32768 | custom (stripped before execution) | custom (stripped before execution) | custom (stripped before execution) | custom (stripped before execution) |
| Sticky | 65536 | no-op | `y` flag | no-op | no-op |
| Ascii | 131072 | no-op | no-op | `re.ASCII` | no-op |

api-nodejs always applies the `g` and `d` flags internally regardless of the `Global`/`HasIndices`
bits, so it returns every match and full index data unconditionally; those two bits remain in the
capability list purely for display purposes.

api-java supports `Unicode` but not `Ascii` — the inverse of api-python. Java's `Pattern` is
ASCII-oriented by default and opts *in* to Unicode character classes, whereas Python's `re` is
Unicode by default and opts *out*. Java also restricts named-group names to `[a-zA-Z][a-zA-Z0-9]*`,
so `(?<my_group>x)` compiles on the other three engines but is a pattern error on Java (returned as
a normal `error` string with HTTP 200).

### Deployment

- **api-dotnet**: Azure App Service (`regex-tester-api-dotnet.azurewebsites.net`)
- **api-nodejs**: Azure App Service (`regex-tester-api-nodejs.azurewebsites.net`)
- **api-python**: Azure App Service (`regex-tester-api-python.azurewebsites.net`)
- **api-java**: Azure App Service (`regex-tester-api-java.azurewebsites.net`)
- **Frontend**: GitHub Pages (`https://regextester.github.io/`)
- **Telemetry**: Azure Cosmos DB (all four backends, optional — disabled when the connection string is empty)

### Testing

- `tests/contract/` — a language-agnostic conformance suite (vitest + ajv), run against a single
  backend at a time via the `BASE_URL` environment variable, e.g.
  `BASE_URL=http://localhost:5200 npx vitest run`. It has 10 spec files and validates every
  `/api/regex` response against the canonical OpenAPI schema plus the behavioural MUST rules in
  [docs/design/api-contract.md](docs/design/api-contract.md). See
  [tests/contract/README.md](tests/contract/README.md).
- `.github/workflows/contract-tests.yml` runs this suite against all four backends in CI on every
  push/PR.

### Documentation

- OpenAPI specs: served at `/openapi/v1.json` and Swagger UI at `/scalar/v1` (all four backends)
- Design docs: `docs/design/`
