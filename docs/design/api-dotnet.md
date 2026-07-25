# api-dotnet — Design Document

> See also: [api-dotnet/ARCHITECTURE.md](../../api-dotnet/ARCHITECTURE.md) for the internal request pipeline, timeout implementation, and telemetry details.

## Overview

.NET 10.0 Web API backend for the RegEx Tester application. Provides a REST API for real-time .NET regex testing with match highlighting, group/capture extraction, and optional telemetry logging to Azure Cosmos DB.

## Technology Stack

- **Framework**: .NET 10.0 / ASP.NET Core
- **Server**: Kestrel
- **API Docs**: OpenAPI 3.0 with Scalar UI
- **Telemetry**: Azure Cosmos DB (optional)
- **Dependencies**: Microsoft.Azure.Cosmos 3.48.0, Newtonsoft.Json 13.0.3, Scalar.AspNetCore 2.x

## Project Structure

```
api-dotnet/
├── Program.cs                      # Entry point, Kestrel MaxRequestBodySize (8192 bytes)
├── Startup.cs                      # Middleware pipeline & DI
├── Controllers/
│   ├── HomeController.cs           # GET / (redirect)
│   ├── CapabilitiesController.cs   # GET /api/capabilities
│   └── RegexController.cs          # POST /api/regex
├── Services/
│   ├── RegExProcessor.cs           # Core regex engine (IRegExProcessor)
│   └── TelemetryService.cs         # Cosmos DB telemetry (ITelemetryService)
├── Models/
│   ├── Input.cs                    # Request DTO
│   ├── RegexResult.cs              # Response DTOs (RegexResult, MatchResult, GroupResult, CaptureResult)
│   ├── RegExTesterOptions.cs       # Bitwise flags enum + shared option registry
│   └── Capabilities.cs             # CapabilitiesResult, Runtime, Limits, Features, CapabilityOption DTOs
├── appsettings.json                # Production config
├── appsettings.Development.json    # Dev config
└── RegExTester.Api.DotNet.csproj   # Project file
```

## API Endpoints

### GET /

302 redirect to `https://regextester.github.io/`.

### GET /api/capabilities

Reports engine identity, runtime (`os`, `framework`), limits, features, and the full option flag
registry (cached 24h). `features.captures` is `"multi"` —
`System.Text.RegularExpressions.Group.Captures` retains every capture of a repeated group, unlike
api-nodejs/api-python. See [api-contract.md](api-contract.md) for the full response shape.

### POST /api/regex

Executes a regex pattern against input text.

**Request**:
```json
{
  "pattern": "(?<word>\\w+)",
  "text": "hello world",
  "replace": "[$1]",
  "options": 32769
}
```

**Response (200)**:
```json
{
  "error": null,
  "replace": "[hello] [world]",
  "matches": [
    {
      "name": "0",
      "index": 0,
      "length": 5,
      "value": "hello",
      "groups": [
        { "name": "word", "index": 0, "length": 5, "value": "hello",
          "captures": [{ "index": 0, "length": 5, "value": "hello" }] }
      ],
      "captures": [{ "index": 0, "length": 5, "value": "hello" }]
    }
  ]
}
```

`matches` is always `[]` (never omitted or `null`), including on error, and all response fields
are always emitted — no null-omission.

**Validation (400)**: pattern > 512, text > 1024, or replace > 1024 chars — returns an RFC 9457
`ProblemDetails` body with `errors: { field: string[] }`.

**Body too large (413)**: a raw request body over `maxRequestBodyBytes` (8192 bytes, enforced by
Kestrel's `MaxRequestBodySize` in `Program.cs`) returns HTTP 413 with a `ProblemDetails` JSON
body, before the body is parsed or any field is validated.

## Core Service: RegExProcessor

- Implements `IRegExProcessor` (registered as Transient)
- Creates `Regex` instance with 15-second `matchTimeout`
- Strips `ShowCaptures` (32768) flag before passing options to `RegexOptions`
- Iterates `regex.Matches(text)`, extracting match/group/capture metadata
- If `replace` is provided, calls `regex.Replace(text, replace)`
- All exceptions caught and returned in `error` field (not HTTP errors)

## Telemetry Service

- Implements `ITelemetryService` (registered as Singleton)
- Logs each regex request to Azure Cosmos DB asynchronously
- Logged fields (12, standardized across all four backends): id, engineKey, timestamp, host,
  userAgent, pattern, text, replace, options, durationMs, matchCount, error
- Partition key: `/timestamp`
- Graceful degradation: no-op when connection string is empty
- Fire-and-forget: failures don't affect API response

## Middleware Pipeline

1. Exception-handling middleware — catches Kestrel's oversized-body exception and turns it into an
   HTTP 413 `ProblemDetails` response (registered immediately inside `UseDeveloperExceptionPage()`
   so it still sees the exception in Development)
2. CORS — configured origins from `AllowCors` config, plus localhost origins reflected
   (never a wildcard) in Development
3. Response Caching
4. HTTPS Redirection
5. Routing
6. Request Timeouts — 5-second timeout that returns HTTP 200 with an `error`-populated body
   (never HTTP 408)
7. Authorization (placeholder)
8. Endpoints — controllers, OpenAPI (`/openapi/v1.json`), Scalar UI (`/scalar/v1`)

## Configuration

| Setting | Dev | Production |
|---------|-----|------------|
| AllowedHosts | localhost | regex-tester-api-dotnet.azurewebsites.net |
| AllowCors | `["https://regextester.github.io"]` | `["https://regextester.github.io"]` |
| Cosmos:ConnectionString | (empty) | (set via Azure config) |
| Cosmos:Database | regex-tester-db | regex-tester-db |
| Cosmos:Container | telemetry | telemetry |

In Development, CORS additionally reflects (never wildcards) any `http(s)://localhost[:port]`
origin, so local frontend dev servers on arbitrary ports work without granting access to the
whole internet.

## JSON Serialization

- Uses System.Text.Json
- Every declared response field is always emitted, including `null` values (e.g. `captures` when
  `ShowCaptures` is off) — no null-omission, per the shared v1 contract

## Deployment

- **Platform**: Azure App Service
- **URL**: `https://regex-tester-api-dotnet.azurewebsites.net`
- **Ports**: http://localhost:5000, https://localhost:5001 (dev)
