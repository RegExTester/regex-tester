# RegEx Tester

[![Contract Tests](https://github.com/RegExTester/regex-tester/actions/workflows/contract-tests.yml/badge.svg)](https://github.com/RegExTester/regex-tester/actions/workflows/contract-tests.yml)
[![Deploy api-dotnet](https://github.com/RegExTester/regex-tester/actions/workflows/deploy-api-dotnet.yml/badge.svg)](https://github.com/RegExTester/regex-tester/actions/workflows/deploy-api-dotnet.yml)
[![Deploy api-nodejs](https://github.com/RegExTester/regex-tester/actions/workflows/deploy-api-nodejs.yml/badge.svg)](https://github.com/RegExTester/regex-tester/actions/workflows/deploy-api-nodejs.yml)
[![Deploy api-python](https://github.com/RegExTester/regex-tester/actions/workflows/deploy-api-python.yml/badge.svg)](https://github.com/RegExTester/regex-tester/actions/workflows/deploy-api-python.yml)
[![Deploy api-java](https://github.com/RegExTester/regex-tester/actions/workflows/deploy-api-java.yml/badge.svg)](https://github.com/RegExTester/regex-tester/actions/workflows/deploy-api-java.yml)
[![Deploy ui-vuejs](https://github.com/RegExTester/regex-tester/actions/workflows/deploy-ui-vuejs.yml/badge.svg)](https://github.com/RegExTester/regex-tester/actions/workflows/deploy-ui-vuejs.yml)

A regex tester with live match highlighting, group/capture extraction, and shareable Base64Url
URLs — implemented as one frontend against **four interchangeable backends** that all satisfy the
same versioned API contract.

That's the point of the repo: the same UI can run against .NET, Node.js, Python, or Java and get
identical results, so it doubles as a side-by-side comparison of the four regex engines.

## Live

- Frontend: **https://regextester.github.io/**
- APIs: [regex-tester-api-dotnet](https://regex-tester-api-dotnet.azurewebsites.net) ·
  [regex-tester-api-nodejs](https://regex-tester-api-nodejs.azurewebsites.net) ·
  [regex-tester-api-python](https://regex-tester-api-python-c9apa4ekfta6hac6.centralus-01.azurewebsites.net) ·
  [regex-tester-api-java](https://regex-tester-api-java-addef8dcgjbqa6bc.centralus-01.azurewebsites.net)

## Projects

| Project | Stack | Directory | Local port |
|---|---|---|---|
| `api-dotnet` | .NET 10.0 Web API | [api-dotnet/](api-dotnet/) | 5000 (5001 https) |
| `api-nodejs` | Node.js 22+ / Express 5 | [api-nodejs/](api-nodejs/) | 5100 |
| `api-python` | Python 3.13 / FastAPI | [api-python/](api-python/) | 5200 |
| `api-java` | Java 21 / Spring Boot 3.4 | [api-java/](api-java/) | 5300 |
| `ui-vuejs` | Vue 3 / Vite 6 SPA | [ui-vuejs/](ui-vuejs/) | 4000 |

## Quick start

Each project runs independently — you only need the frontend plus whichever backend(s) you want to
test against.

### Windows (PowerShell)

```powershell
# api-dotnet — http://localhost:5000
Set-Location api-dotnet; dotnet run

# api-nodejs — http://localhost:5100
Set-Location api-nodejs; npm install; npm start

# api-python — http://localhost:5200
Set-Location api-python; pip install -r requirements.txt; python -m uvicorn src.main:app --port 5200

# api-java — http://localhost:5300
Set-Location api-java; mvn package -DskipTests; java -jar target/app.jar

# ui-vuejs — http://localhost:4000
Set-Location ui-vuejs; npm install; npm start
```

### macOS / Linux (bash)

```bash
# api-dotnet — http://localhost:5000
cd api-dotnet && dotnet run

# api-nodejs — http://localhost:5100
cd api-nodejs && npm install && npm start

# api-python — http://localhost:5200
cd api-python && pip install -r requirements.txt && python -m uvicorn src.main:app --port 5200

# api-java — http://localhost:5300
cd api-java && mvn package -DskipTests && java -jar target/app.jar

# ui-vuejs — http://localhost:4000
cd ui-vuejs && npm install && npm start
```

The frontend's `.env` already points at `localhost:5000` / `:5100` / `:5200` / `:5300`, so no extra
configuration is needed for local development. Switch engines at runtime with the dropdown in the
UI.

## How it works

1. User types a pattern/text — input is debounced (800 ms).
2. Pattern and text are Base64Url-encoded into the shareable URL.
3. The pair is POSTed to `/api/regex` on whichever backend is currently selected.
4. The backend runs the match (15 s regex timeout, 5 s request timeout) and returns matches,
   groups, and captures.
5. Results are rendered with match highlighting.

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — system-level design, diagrams, cross-cutting concerns
- [DEPLOYMENT.md](DEPLOYMENT.md) — how to provision Azure and deploy from a fork
- [docs/design/api-contract.md](docs/design/api-contract.md) — the shared v1 API contract
- [docs/open-api/](docs/open-api/) — canonical OpenAPI document and generated per-backend snapshots
- [tests/contract/](tests/contract/) — language-agnostic conformance suite run against every backend
- [CLAUDE.md](CLAUDE.md) — contributor/agent guide to the codebase

## License

[MIT](LICENSE)
