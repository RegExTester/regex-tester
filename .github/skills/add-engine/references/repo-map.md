# Repo map — projects, ports, commands

## Projects

| Project | Stack | Directory | Dev port | Engine key |
|---|---|---|---|---|
| api-dotnet | .NET 10.0 Web API | `api-dotnet/` | 5000 (5001 https) | `DOTNET` |
| api-nodejs | Node.js 22 / Express 5 | `api-nodejs/` | 5100 | `NODEJS` |
| api-python | Python 3.13 / FastAPI | `api-python/` | 5200 | `PYTHON` |
| ui-vuejs | Vue 3 / Vite 6 SPA | `ui-vuejs/` | **4000** | — |

Next free backend port for a new engine: **5300**.

## Endpoints (identical on every backend)

- `GET /` → 302 to `https://regextester.github.io/`
- `GET /api/capabilities` — engine identity, `runtime` `{ os, framework }`, limits, features, option registry (cached 24 h)
- `POST /api/regex` — the actual work
- `GET /openapi/v1.json` and UI at `/scalar/v1`

`GET /api/version` was removed and now 404s. Never reintroduce it.

## Per-backend key files

**api-dotnet**
- `Controllers/RegexController.cs`, `Controllers/CapabilitiesController.cs`, `Controllers/HomeController.cs`
- `Services/RegExProcessor.cs` — regex engine, 15 s timeout
- `Services/TelemetryService.cs` — Cosmos, fire-and-forget
- `Models/RegExTesterOptions.cs` — flags enum + option registry + `RegExTesterOptionsRegistry.EngineKey`
- `Startup.cs` — CORS, DI, 5 s request timeout, 413 handling, OpenAPI/Scalar
- `Program.cs` — Kestrel `MaxRequestBodySize`

**api-nodejs**
- `src/index.js` — app, CORS, body limit, routes, Swagger UI
- `src/controllers/regexController.js`, `src/services/regexProcessor.js`
- `src/services/capabilities.js` — option registry, limits, `ENGINE_KEY`
- `src/services/telemetryService.js`, `src/middleware/requestTimeout.js`, `src/middleware/errorHandler.js`
- `src/openapi.js` + `src/schemas.js` — OpenAPI from `@openapi` JSDoc

**api-python**
- `src/main.py` — app, CORS, middleware order, exception handlers
- `src/routers/regex.py`, `src/routers/home.py`
- `src/services/regex_processor.py`, `src/services/capabilities.py` (`ENGINE_KEY`), `src/services/telemetry_service.py`
- `src/options.py` — bitmask → `re` flags + option registry
- `src/middleware/request_timeout.py`, `src/middleware/max_body_size.py`

**ui-vuejs**
- `src/components/RegexTester.vue` — main component, engine switching, capability-driven options
- `src/config.js` — registers engines; `config.dotnet.js` / `config.nodejs.js` / `config.python.js`
- `src/utils/encodeUriHelper.js` — Base64Url (RFC 7515)
- `.env` / `.env.production` — `VITE_API_<ENGINE>` base URLs

## Run commands (Windows PowerShell 5.1)

The terminal tool strips a **leading** `Set-Location`. Use absolute paths, `Push-Location`, or put
another statement first.

```powershell
# api-dotnet
Push-Location d:\git\regex-tester\api-dotnet; $env:ASPNETCORE_URLS='http://localhost:5000'; $env:ASPNETCORE_ENVIRONMENT='Development'; dotnet run --no-launch-profile

# api-nodejs
Push-Location d:\git\regex-tester\api-nodejs; node src/index.js

# api-python
Push-Location d:\git\regex-tester\api-python; .\.venv\Scripts\python.exe -m uvicorn src.main:app --port 5200

# ui-vuejs
Push-Location d:\git\regex-tester\ui-vuejs; npm.cmd start
```

Use `npm.cmd` / `npx.cmd`, not `npm` / `npx`. If `git` is unresolvable use
`& 'C:\Program Files\Git\cmd\git.exe'`, and prefer `git -C <repo>` over relying on the working directory.

## Conformance suite

`tests/contract/` — vitest + ajv. Validates every response against the canonical OpenAPI schema plus
the behavioural MUST rules. Run against one backend at a time:

```powershell
Push-Location d:\git\regex-tester\tests\contract; $env:BASE_URL='http://localhost:5200'; node .\node_modules\vitest\vitest.mjs run
```

Do **not** pass `--root` — it breaks module resolution and every suite fails to collect with
"no tests", which looks like a real regression but is not.

`.github/workflows/contract-tests.yml` runs this against all three backends on every push and PR.
It is also a **reusable workflow** (`workflow_call`) that every deploy workflow calls as a gating
`test` job — nothing deploys unless all engines are green for that commit. Preserve that wiring.

## Regenerating the OpenAPI snapshots

With the backend running, from the repo root:

```powershell
node -e "fetch('http://localhost:5000/openapi/v1.json').then(r=>r.json()).then(o=>require('fs').writeFileSync('docs/open-api/api-dotnet.v1.json', JSON.stringify(o,null,2)+'\n'))"
```

Repeat for 5100 → `api-nodejs.v1.json` and 5200 → `api-python.v1.json`.

**Never use PowerShell's `ConvertTo-Json`** — it mangles deeply nested structures.

`api-dotnet.csproj` deliberately has **no** `OpenApiGenerateDocumentsOnBuild` and no
`Microsoft.Extensions.ApiDescription.Server`; re-adding them recreates a deleted output directory.

## Killing orphaned servers

Subagents leave servers running, which locks the .NET build output:

```powershell
Get-NetTCPConnection -State Listen -LocalPort 5000,5100,5200,4000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force }
```

## Deployment

Azure App Service: `regex-tester-api-dotnet` / `-nodejs` / `-python`, resource group `regex-tester`,
region `centralus`, plan SKU `S1`. Frontend on GitHub Pages via the external repo
`RegExTester/regextester.github.io` (branch `master`). Remote is `RegExTester/regex-tester`.

The only three CI secrets: `AZURE_CREDENTIALS` (all backend deploys), `AZURE_RESOURCE_GROUP`
(api-python only), `PAGES_DEPLOY_TOKEN` (frontend only). See [DEPLOYMENT.md](../../../../DEPLOYMENT.md).
