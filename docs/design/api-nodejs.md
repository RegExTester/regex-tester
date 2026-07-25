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
│   │   ├── homeController.js       # GET / (redirect), GET /api/version, GET /api/capabilities
│   │   └── regexController.js      # POST /api/regex
│   ├── services/
│   │   ├── regexProcessor.js       # Core JS regex engine
│   │   └── capabilities.js         # GET /api/capabilities option registry and limits
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
Returns engine identity and runtime version info (cached 24h in-memory).
```json
{
  "engineKey": "NODEJS",
  "engineName": "Node.js",
  "contractVersion": "1.0",
  "os": "Windows_NT 10.0.26200 x64",
  "framework": "Node.js v22.0.0",
  "osDescription": "Windows_NT 10.0.26200 x64",
  "frameworkDescription": "Node.js v22.0.0"
}
```
`osDescription`/`frameworkDescription` are deprecated aliases for `os`/`framework`, retained for
one release for backward compatibility.

### GET /api/capabilities
Reports limits, features, and the full option flag registry (cached 24h). `features.captures` is
`"single"` — the JS `RegExp`/`String.matchAll` API only exposes the last capture per group.

### POST /api/regex
Executes JavaScript regex. Same request/response schema as the other backends. `matches` is
always `[]` (never `null`), including on error, and all fields are always emitted (no
null-omission). An empty or `null` `pattern` returns
`{ "error": null, "replace": null, "matches": [] }`.

### GET /openapi/v1.json
Raw OpenAPI 3.1.1 JSON document.

### GET /scalar/v1
Swagger UI interactive API explorer.

## Core Service: RegexProcessor

- Static class with `match(pattern, text, replace, options)` method
- An empty/`null` `pattern` short-circuits to `{ error: null, replace: null, matches: [] }`
- Maps bitwise option flags to JavaScript RegExp flags:
  - IgnoreCase (1) → `i`, Multiline (2) → `m`, Singleline (16) → `s` (dotAll)
  - **Always** applies `g` (global) and `d` (indices) flags internally, regardless of the
    `Global` (4096) / `HasIndices` (2048) option bits — so every non-overlapping match is
    returned unconditionally; those two bits remain in `/api/capabilities` for display purposes
    only
- `IgnorePatternWhitespace` (32): strips unescaped whitespace and `#` comments from pattern
- Strips `ShowCaptures` (32768) before creating RegExp
- Uses `String.matchAll()` iterator with deadline-based timeout (15 seconds)
- Group names resolved via `match.groups` object and `match.indices` array
- Replace uses a fresh RegExp instance (matchAll exhausts the iterator)
- All errors caught and returned in `error` field

### Regex Options — contract flags to JS mapping

| Value | Name | JS Equivalent | Notes |
|-------|------|--------------|-------|
| 1 | IgnoreCase | `i` flag | Supported |
| 2 | Multiline | `m` flag | Supported |
| 4 | ExplicitCapture | — | No-op (JS captures all groups) |
| 8 | Compiled | — | No-op (V8 JIT compiles) |
| 16 | Singleline | `s` flag | Supported (dotAll) |
| 32 | IgnorePatternWhitespace | custom | Strips whitespace/comments |
| 64 | RightToLeft | — | No-op |
| 256 | ECMAScript | — | No-op (default in JS) |
| 512 | CultureInvariant | — | No-op |
| 1024 | NonBacktracking | — | No-op |
| 2048 | HasIndices | `d` flag | Always applied internally; bit is display-only |
| 4096 | Global | `g` flag | Always applied internally; bit is display-only |
| 8192 | Unicode | `u` flag | Supported |
| 16384 | UnicodeSets | `v` flag | Supported |
| 32768 | ShowCaptures | custom | Populates capture arrays |
| 65536 | Sticky | `y` flag | Supported |
| 131072 | Ascii | — | No-op |

## Request Timeout

- **HTTP timeout**: 5 seconds via `requestTimeout` middleware on `/api/regex`
- **Regex timeout**: 15 seconds checked per match iteration in `RegexProcessor`
- Both return error in response body (HTTP 200), not HTTP error status

## Validation

- pattern: max 512 characters
- text: max 1024 characters
- replace: max 1024 characters
- Returns HTTP 400 with an RFC 9457 `ProblemDetails` body (`errors: { field: string[] }`) on
  validation failure
- A raw request body larger than `maxRequestBodyBytes` (8192 bytes, enforced by the
  `express.json({ limit })` option) returns HTTP 413 with a `ProblemDetails` JSON body, before the
  body is parsed or any field is validated

## CORS Configuration

| Origin | Allowed when |
|--------|-------------|
| `https://regextester.github.io` | Always |
| `ALLOW_CORS` env var (comma-separated) | Always |
| `http(s)://localhost[:port]` | Reflected (never a wildcard) in every environment |

No environment ever returns `Access-Control-Allow-Origin: *`.

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
| `NODE_ENV` | — | Standard Express environment flag; does not control CORS (see CORS Configuration above) |
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
