# api-dotnet — Design Document

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
├── Program.cs                      # Entry point
├── Startup.cs                      # Middleware pipeline & DI
├── Controllers/
│   ├── HomeController.cs           # GET / (redirect), GET /api/version
│   └── RegexController.cs          # POST /api/regex
├── Services/
│   ├── RegExProcessor.cs           # Core regex engine (IRegExProcessor)
│   └── TelemetryService.cs         # Cosmos DB telemetry (ITelemetryService)
├── Models/
│   ├── Input.cs                    # Request DTO
│   ├── RegexResult.cs              # Response DTOs (RegexResult, MatchResult, GroupResult, CaptureResult)
│   └── RegExTesterOptions.cs       # Bitwise flags enum
├── appsettings.json                # Production config
├── appsettings.Development.json    # Dev config
└── RegExTester.Api.DotNet.csproj   # Project file
```

## API Endpoints

### GET /

302 redirect to `https://regextester.github.io/`.

### GET /api/version

Returns runtime version info. Response cached for 24 hours.

```json
{
  "os": "Windows 11 Pro 10.0.26200",
  "framework": ".NET 10.0.0"
}
```

In DEBUG builds, includes `"debug": 1`.

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

**Validation (400)**: pattern > 512, text > 1024, or replace > 1024 chars.

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
- Logged fields: id, timestamp, host, user-agent, pattern, text, replace, options
- Partition key: `/timestamp`
- Graceful degradation: no-op when connection string is empty
- Fire-and-forget: failures don't affect API response

## Middleware Pipeline

1. CORS — configured origins from `AllowCors` config; `AllowAnyOrigin()` in DEBUG
2. Response Caching
3. HTTPS Redirection
4. Routing
5. Request Timeouts — 5-second default policy
6. Authorization (placeholder)
7. Endpoints — controllers, OpenAPI (`/openapi/v1.json`), Scalar UI (`/scalar/v1`)

## Configuration

| Setting | Dev | Production |
|---------|-----|------------|
| AllowedHosts | localhost | regex-tester-api-dotnet.azurewebsites.net |
| AllowCors | `["*"]` | `["https://regextester.github.io"]` |
| Cosmos:ConnectionString | (empty) | (set via Azure config) |
| Cosmos:Database | regex-tester-db | regex-tester-db |
| Cosmos:Container | telemetry | telemetry |

## JSON Serialization

- Uses System.Text.Json with `JsonIgnoreCondition.WhenWritingNull`
- Null fields (e.g., `captures` when ShowCaptures is off) are omitted from response

## Deployment

- **Platform**: Azure App Service
- **URL**: `https://regex-tester-api-dotnet.azurewebsites.net`
- **Ports**: http://localhost:5000, https://localhost:5001 (dev)
