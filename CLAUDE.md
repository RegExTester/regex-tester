# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

RegEx Tester is a two-tier web application:
- **Frontend**: Angular 21.1 SPA (`ui-angular/`)
- **Backend**: .NET 10.0 Web API (`api-dotnet/`)

The app allows real-time regex testing with match highlighting, group/capture extraction, and URL-based sharing of test cases via Base64Url encoding.

## Commands

### Frontend (`ui-angular/`)

```bash
npm start          # Dev server at http://localhost:4200
npm run build      # Production build to dist/
npm run build-prod # Optimized production build
npm run test       # Karma unit tests
npm run lint       # TSLint validation
npm run deploy     # Deploy to GitHub Pages
```

### Backend (`api-dotnet/`)

```bash
dotnet build       # Build the project
dotnet run         # Dev server at http://localhost:5000 / https://localhost:5001
dotnet publish -c Release  # Production publish
```

## Architecture

### Request Flow

1. User types in the Angular UI — inputs are debounced (800ms)
2. Pattern and text are Base64Url-encoded and POSTed to `POST /api/regex`
3. `RegExProcessor` runs the match with a 15-second timeout, extracts groups/captures
4. Results are returned and rendered with match highlighting; the URL is updated for shareability
5. `TelemetryService` logs usage to Azure Cosmos DB (optional, requires connection string)

### Backend Key Files

- `Controllers/RegexController.cs` — single POST endpoint, validates input (pattern ≤512 chars, text ≤1024 chars)
- `Services/RegExProcessor.cs` — core regex logic; extracts matches, groups, and optional captures
- `Models/RegExTesterOptions.cs` — flags enum mapping .NET `RegexOptions` plus a custom `ShowCaptures` flag
- `Startup.cs` — CORS config, DI registration, timeout policies

### Frontend Key Files

- `src/app/regex/regex.component.ts` — main component: form handling, API calls, debouncing, URL sync
- `src/app/regex/regex.config.ts` — API endpoint constants and regex option definitions
- `src/utils/encodeUriHelper.ts` — Base64Url encode/decode (RFC7515) used for shareable URLs
- `src/environments/` — `environment.ts` points to localhost:5000; `environment.prod.ts` points to Azure

### Deployment

- Backend: Azure App Service (`regex-tester-api-dotnet.azurewebsites.net`)
- Frontend: GitHub Pages (`https://regextester.github.io/`)
- Telemetry: Azure Cosmos DB (partition key on timestamp)
