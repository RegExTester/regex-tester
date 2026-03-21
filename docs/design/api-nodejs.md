# api-nodejs — Design Document

## Overview

Node.js/Express backend for the RegEx Tester application. Mirrors the .NET API contract, providing the same endpoints and response format using JavaScript's native RegExp engine.

## Technology Stack

- **Runtime**: Node.js >= 22.0.0 (ES modules)
- **Framework**: Express 5.1.0
- **API Docs**: Swagger UI Express + custom JSDoc `@openapi` parser with js-yaml
- **Dependencies**: cors, js-yaml, swagger-ui-express

## Project Structure

```
api-nodejs/
├── src/
│   ├── index.js                    # Express app, CORS, routes
│   ├── openapi.js                  # OpenAPI doc generator (parses @openapi JSDoc)
│   ├── schemas.js                  # Component schemas via @openapi JSDoc
│   ├── controllers/
│   │   ├── homeController.js       # GET / (redirect), GET /api/version
│   │   └── regexController.js      # POST /api/regex
│   ├── services/
│   │   └── regexProcessor.js       # Core JS regex engine
│   └── middleware/
│       └── requestTimeout.js       # HTTP timeout middleware
├── package.json
└── .gitignore
```

## API Endpoints

Same contract as api-dotnet. See [api-dotnet design doc](api-dotnet.md) for full request/response schemas.

### GET /
302 redirect to `https://regextester.github.io/`.

### GET /api/version
Returns OS and Node.js version info (cached 24h in-memory).
```json
{
  "osDescription": "Windows_NT 10.0.26200 x64",
  "frameworkDescription": "Node.js v22.0.0"
}
```

### POST /api/regex
Executes JavaScript regex. Same request/response schema as .NET API.

### GET /openapi/v1.json
Raw OpenAPI 3.1.1 JSON document.

### GET /scalar/v1
Swagger UI interactive API explorer.

## Core Service: RegexProcessor

- Static class with `match(pattern, text, replace, options)` method
- Maps bitwise option flags to JavaScript RegExp flags:
  - IgnoreCase (1) → `i`, Multiline (2) → `m`, Singleline (16) → `s` (dotAll)
  - Always applies `g` (global) and `d` (indices) flags
- `IgnorePatternWhitespace` (32): strips unescaped whitespace and `#` comments from pattern
- Strips `ShowCaptures` (32768) before creating RegExp
- Uses `String.matchAll()` iterator with deadline-based timeout (15 seconds)
- Group names resolved via `match.groups` object and `match.indices` array
- Replace uses a fresh RegExp instance (matchAll exhausts the iterator)
- All errors caught and returned in `error` field

### Regex Options — .NET to JS Mapping

| .NET Flag | Value | JS Equivalent | Notes |
|-----------|-------|--------------|-------|
| IgnoreCase | 1 | `i` flag | Supported |
| Multiline | 2 | `m` flag | Supported |
| ExplicitCapture | 4 | — | No-op (JS captures all groups) |
| Compiled | 8 | — | No-op (V8 JIT compiles) |
| Singleline | 16 | `s` flag | Supported (dotAll) |
| IgnorePatternWhitespace | 32 | custom | Strips whitespace/comments |
| RightToLeft | 64 | — | No-op |
| ECMAScript | 256 | — | No-op (default in JS) |
| CultureInvariant | 512 | — | No-op |
| NonBacktracking | 1024 | — | No-op |
| ShowCaptures | 32768 | custom | Populates captures arrays |

## Request Timeout

- **HTTP timeout**: 5 seconds via `requestTimeout` middleware on `/api/regex`
- **Regex timeout**: 15 seconds checked per match iteration in `RegexProcessor`
- Both return error in response body (HTTP 200), not HTTP error status

## Validation

- pattern: max 512 characters
- text: max 1024 characters
- replace: max 1024 characters
- Returns HTTP 400 with ProblemDetails-style response on validation failure

## CORS Configuration

| Environment | Origins |
|-------------|---------|
| `NODE_ENV=development` | `*` (all origins) |
| Default | `http://localhost:5173`, `https://regextester.github.io` |
| Custom | `ALLOW_CORS` env var (comma-separated) |

## OpenAPI Documentation

Auto-generated from JSDoc `@openapi` YAML blocks using a custom parser:
1. Scans `src/controllers/*.js` and `src/schemas.js` for JSDoc comments
2. Extracts YAML blocks after `@openapi` markers
3. Parses with `js-yaml` and deep-merges into the OpenAPI definition
4. Avoids `swagger-jsdoc` package (which triggers Node.js `url.parse()` deprecation warning)

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 5100 | HTTP listen port |
| `NODE_ENV` | — | `'development'` enables wildcard CORS |
| `ALLOW_CORS` | — | Comma-separated allowed origins |

## Key Differences from api-dotnet

| Aspect | api-dotnet | api-nodejs |
|--------|-----------|-----------|
| Runtime | .NET 10.0 | Node.js 22+ |
| Port | 5000/5001 | 5100 |
| Regex engine | System.Text.RegularExpressions | JavaScript RegExp |
| Telemetry | Cosmos DB | Not implemented |
| OpenAPI generation | Built-in ASP.NET OpenApi | Custom JSDoc parser |
| HTTPS | Enabled (with redirect) | Not enabled (reverse proxy expected) |

## Deployment

- **Platform**: Azure App Service
- **URL**: `https://regex-tester-api-nodejs.azurewebsites.net`
- **Port**: 5100 (dev)
