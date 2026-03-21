# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

RegEx Tester is a mono-repo containing two frontend SPAs and two backend APIs that provide real-time regex testing with match highlighting, group/capture extraction, and URL-based sharing via Base64Url encoding.

### Projects

| Project | Tech Stack | Directory |
|---------|-----------|-----------|
| **api-dotnet** | .NET 10.0 Web API | `api-dotnet/` |
| **api-nodejs** | Node.js 22+ / Express 5 | `api-nodejs/` |
| **ui-angular** | Angular 21.1 SPA | `ui-angular/` |
| **ui-vuejs** | Vue 3 / Vite 6 SPA | `ui-vuejs/` |

The frontends are interchangeable — both call the same API contract (`POST /api/regex`). The Vue.js frontend supports switching between the .NET and Node.js backends at runtime via an engine dropdown.

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

### ui-angular

```bash
npm start                      # Dev server at http://localhost:4200
npm run build                  # Production build to dist/
npm run build-prod             # Optimized production build
npm run test                   # Karma unit tests
npm run lint                   # TSLint validation
npm run deploy                 # Deploy to GitHub Pages
```

### ui-vuejs

```bash
npm start                      # Vite dev server at http://localhost:5173
npm run dev                    # Alias for npm start
npm run build                  # Production build to dist/
npm run build-prod             # Optimized production build
npm run preview                # Preview production build
```

## Architecture

### API Contract (shared by both backends)

**POST /api/regex** — Run a regex and return all matches.

- Request: `{ pattern, text, replace?, options }` (pattern ≤512, text/replace ≤1024 chars, options = bitwise flags)
- Response: `{ error, replace, matches[] }` where each match has `{ name, index, length, value, groups[], captures[] }`
- Regex errors and timeouts return in the `error` field (HTTP 200), not as HTTP error codes
- `ShowCaptures` flag (32768) enables capture arrays; stripped before regex execution

**GET /api/version** — Runtime version info (cached 24h).

**GET /** — 302 redirect to `https://regextester.github.io/`.

### Request Flow

1. User types in the frontend — inputs are debounced (800ms)
2. Pattern and text are Base64Url-encoded for the shareable URL, then POSTed to `POST /api/regex`
3. Backend runs the regex match with a 15-second timeout, extracts groups/captures
4. Results are returned and rendered with match highlighting; the URL is updated for shareability

### api-dotnet Key Files

- `Controllers/RegexController.cs` — POST endpoint, model validation
- `Services/RegExProcessor.cs` — core regex logic with 15s timeout
- `Services/TelemetryService.cs` — optional Cosmos DB usage logging
- `Models/RegExTesterOptions.cs` — flags enum mapping `RegexOptions` + `ShowCaptures`
- `Startup.cs` — CORS, DI, 5s request timeout, OpenAPI (Scalar UI at `/scalar/v1`)

### api-nodejs Key Files

- `src/index.js` — Express app, CORS, routes, Swagger UI at `/scalar/v1`
- `src/controllers/regexController.js` — POST endpoint with validation
- `src/services/regexProcessor.js` — JS regex engine, flag mapping, 15s timeout
- `src/middleware/requestTimeout.js` — 5s HTTP timeout
- `src/openapi.js` — auto-generates OpenAPI spec from `@openapi` JSDoc annotations
- `src/schemas.js` — OpenAPI component schemas via JSDoc

### ui-angular Key Files

- `src/app/regex/regex.component.ts` — main component: form, API calls, debouncing, URL sync
- `src/app/regex/regex.config.ts` — API endpoints and regex option definitions
- `src/utils/encodeUriHelper.ts` — Base64Url encode/decode (RFC7515)
- `src/environments/` — `environment.ts` (localhost:5000), `environment.prod.ts` (Azure)

### ui-vuejs Key Files

- `src/components/RegexTester.vue` — main component with engine switching
- `src/config.js` — API endpoints for both engines, regex options, engine definitions
- `src/utils/encodeUriHelper.js` — Base64Url encode/decode (RFC7515)
- `.env` / `.env.production` — API base URLs for .NET (port 5000) and Node.js (port 5100)

### Regex Options (bitwise flags)

| Flag | Value | .NET | Node.js |
|------|-------|------|---------|
| IgnoreCase | 1 | `RegexOptions.IgnoreCase` | `i` flag |
| Multiline | 2 | `RegexOptions.Multiline` | `m` flag |
| ExplicitCapture | 4 | `RegexOptions.ExplicitCapture` | no-op |
| Compiled | 8 | `RegexOptions.Compiled` | no-op |
| Singleline | 16 | `RegexOptions.Singleline` | `s` flag |
| IgnorePatternWhitespace | 32 | `RegexOptions.IgnorePatternWhitespace` | strip whitespace/comments |
| RightToLeft | 64 | `RegexOptions.RightToLeft` | no-op |
| ECMAScript | 256 | `RegexOptions.ECMAScript` | no-op (default) |
| CultureInvariant | 512 | `RegexOptions.CultureInvariant` | no-op |
| NonBacktracking | 1024 | `RegexOptions.NonBacktracking` | no-op |
| ShowCaptures | 32768 | custom (stripped before execution) | custom (stripped before execution) |

### Deployment

- **api-dotnet**: Azure App Service (`regex-tester-api-dotnet.azurewebsites.net`)
- **api-nodejs**: Azure App Service (`regex-tester-api-nodejs.azurewebsites.net`)
- **Frontend**: GitHub Pages (`https://regextester.github.io/`)
- **Telemetry**: Azure Cosmos DB (api-dotnet only, optional)

### Documentation

- OpenAPI specs: served at `/openapi/v1.json` and Swagger UI at `/scalar/v1` (both backends)
- Design docs: `docs/design/`
