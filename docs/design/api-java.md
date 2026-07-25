# api-java — Design Document

> See also: [api-java/ARCHITECTURE.md](../../api-java/ARCHITECTURE.md) for the internal request pipeline, timeout implementation, and telemetry details.

## 1. Overview

Spring Boot backend for the RegEx Tester application. Implements the [canonical v1 API
contract](api-contract.md) using only the JDK's built-in `java.util.regex` package (no third-party
regex library), providing the same endpoints and response shapes as `api-dotnet`, `api-nodejs` and
`api-python`.

## 2. Technology Stack

- **Runtime**: Java 21 (LTS) — Java 20 is the effective floor, see §5
- **Framework**: Spring Boot 3.4 (Spring MVC on embedded Tomcat 10.1)
- **Build**: Maven, producing an executable `target/app.jar`
- **API Docs**: springdoc-openapi (Swagger UI), served on the contract's routes
- **Dependencies**: `spring-boot-starter-web`, `spring-boot-starter-validation`,
  `springdoc-openapi-starter-webmvc-ui`, `azure-cosmos` (see `pom.xml`)

## 3. Project Structure

```
api-java/
├── src/main/java/io/github/regextester/api/
│   ├── Application.java                  # Spring Boot entry point
│   ├── config/
│   │   ├── CorsConfig.java               # CorsFilter registered ahead of the DispatcherServlet
│   │   └── OpenApiConfig.java            # OpenAPI document metadata
│   ├── controller/
│   │   ├── HomeController.java           # GET / (redirect), GET /api/capabilities
│   │   ├── RegexController.java          # POST /api/regex
│   │   └── ApiExceptionHandler.java      # 400 / 413 / async-timeout -> contract responses
│   ├── filter/
│   │   └── MaxBodySizeFilter.java        # Enforces maxRequestBodyBytes (8192) -> HTTP 413
│   ├── model/                            # Records mirroring the v1 contract schemas
│   ├── options/
│   │   └── RegexOptions.java             # Option flag registry and bitmask -> Pattern flags
│   └── service/
│       ├── RegexProcessor.java           # Core java.util.regex matching/replace engine, 15s deadline
│       ├── CapabilitiesService.java      # Builds the GET /api/capabilities response body
│       ├── TimeLimitedCharSequence.java  # Deadline-enforcing CharSequence backing the 15s timeout
│       └── TelemetryService.java         # Cosmos DB telemetry, standardized across all four backends (see §12)
├── src/main/resources/application.properties
└── pom.xml
```

## 4. API Endpoints

Same contract as the other three backends. See [api-contract.md](api-contract.md) and
[regex-tester-api.v1.yaml](../open-api/regex-tester-api.v1.yaml) for the full request/response
schemas.

### GET /

302 redirect to `https://regextester.github.io/`.

### GET /api/capabilities

Returns engine identity, runtime, limits, features, and the full option flag registry
(`Cache-Control: public, max-age=86400`).

```json
{
  "engineKey": "JAVA",
  "engineName": "Java",
  "contractVersion": "1.0",
  "runtime": {
    "os": "Linux 6.5.0 amd64",
    "framework": "Java 21.0.12"
  }
}
```

`features.captures` is `"single"` — see §12.

### POST /api/regex

Executes a `java.util.regex` pattern against `text`. Same request/response schema as the other
backends.

```json
{
  "pattern": "(?<word>\\w+)",
  "text": "hello world",
  "replace": null,
  "options": 0
}
```

An invalid pattern or a 15-second timeout returns HTTP 200 with `error` populated and
`matches: []`. An empty or `null` `pattern` returns
`{ "error": null, "replace": null, "matches": [] }`.

### GET /openapi/v1.json and GET /scalar/v1

springdoc-openapi generates the document from the controller annotations and model records;
`application.properties` sets `springdoc.api-docs.path=/openapi/v1.json` and
`springdoc.swagger-ui.path=/scalar/v1`.

## 5. Core Service: RegexProcessor

`src/main/java/io/github/regextester/api/service/RegexProcessor.java`:

- `match(pattern, text, replace, options)` returns a `RegexResult`.
- An empty/`null` `pattern` short-circuits to `{ error: null, replace: null, matches: [] }`
  before any compilation is attempted.
- **No pattern translation.** Java spells named groups `(?<name>...)`, exactly as .NET and
  JavaScript do, so api-python's `(?P<name>...)` rewriting has no counterpart here.
- Converts the `$$` replacement escape to Java's `\$` and doubles literal backslashes; `$1` and
  `${name}` mean the same thing in both dialects and pass through untouched.
- Iterates `matcher.find()`, with the input wrapped in a `TimeLimitedCharSequence` that throws once
  a 15-second deadline passes; on expiry returns
  `"The regex match timed out (exceeded 15 seconds)."` with `matches: []`.
- For each match, groups that did not participate (`matcher.start(i) < 0`) are skipped, matching
  the contract's group-reporting rules.
- Named groups report their name, recovered from `Pattern.namedGroups()`; numbered groups fall back
  to their 1-based index as a string. **`namedGroups()` was added in Java 20 and is the reason this
  project requires a modern JDK** — before it, group names could only be recovered by re-parsing the
  pattern text, which is fragile around lookbehind and escaped parentheses.
- `PatternSyntaxException` at compile time, and any runtime failure during matching or
  `replaceAll()` (such as `$9` with no group 9), is caught and returned via `error` (never raised as
  an HTTP error). A failed replacement keeps the matches already found.

## 6. Regex Options — contract flags to Java `Pattern` mapping

| Value | Name | Java `Pattern` flag | Notes |
|---|---|---|---|
| 1 | IgnoreCase | `CASE_INSENSITIVE` | Supported |
| 2 | Multiline | `MULTILINE` | Supported |
| 4 | ExplicitCapture | — | No-op |
| 8 | Compiled | — | No-op (Java always precompiles to a `Pattern`) |
| 16 | Singleline | `DOTALL` | Supported |
| 32 | IgnorePatternWhitespace | `COMMENTS` | Supported |
| 64 | RightToLeft | — | No-op |
| 256 | ECMAScript | — | No-op |
| 512 | CultureInvariant | — | No-op |
| 1024 | NonBacktracking | — | No-op |
| 2048 | HasIndices | — | No-op |
| 4096 | Global | — | No-op (this engine always returns every match; see §12 and api-contract.md §4) |
| 8192 | Unicode | `UNICODE_CHARACTER_CLASS` | Supported — also implies `UNICODE_CASE` |
| 16384 | UnicodeSets | — | No-op |
| 32768 | ShowCaptures | custom, stripped | Supported — populates single-element `captures` arrays |
| 65536 | Sticky | — | No-op |
| 131072 | Ascii | — | No-op — see below |

`Ascii` being unsupported here is deliberate, not an omission. `\w`, `\d` and `\b` are already
ASCII-only in Java by default, so the bit would have nothing to do; Unicode-aware matching is
opt-*in* via `Unicode`. That is the exact inverse of Python, where matching is Unicode-aware by
default and `re.ASCII` opts out — which is why the two engines support opposite ends of the same
pair.

`options/RegexOptions.java` is the single source of truth for this table (`SUPPORTED_PATTERN_FLAGS`
and `REGISTRY`); unsupported/unknown bits are masked out and silently ignored rather than raising.

## 7. Request Timeout

- **HTTP timeout**: 5 seconds, via `spring.mvc.async.request-timeout=5000` applied to the
  `Callable` returned by `RegexController`. On expiry Spring raises `AsyncRequestTimeoutException`,
  which `ApiExceptionHandler` converts into HTTP 200 with
  `{ "error": "The request timed out (exceeded 5 seconds).", "replace": null, "matches": [] }` —
  never HTTP 408, and never Spring's default 503.
- **Regex timeout**: 15 seconds. `java.util.regex` has no native timeout and `Thread.stop()` was
  removed in Java 20, so the input is wrapped in a `TimeLimitedCharSequence` that checks a
  `System.nanoTime()` deadline every 1024 `charAt()` calls. Because the matcher must read characters
  to make progress, this preempts even a single catastrophically backtracking match — unlike
  api-python's and api-nodejs's between-match deadline checks.

## 8. Validation

- `pattern` ≤ 512 characters, `text` ≤ 1024 characters, `replace` ≤ 1024 characters
  (`jakarta.validation` `@Size(max = ...)` on the `Input` record); `options` defaults to `0`.
- A field-level violation raises `MethodArgumentNotValidException`, converted by
  `ApiExceptionHandler` into an HTTP 400 RFC 9457 `ProblemDetails` body with
  `errors: { field: string[] }`.
- Independently of field-level validation, `MaxBodySizeFilter` rejects any raw request body over
  `maxRequestBodyBytes` (8192 bytes) with HTTP 413 and a `ProblemDetails` JSON body, checked before
  the body is parsed — so an oversized body is always reported as 413, never 400, per
  `docs/design/api-contract.md` §4/§5. Being a servlet filter it runs ahead of the
  `DispatcherServlet`, and it counts bytes as they stream in, so it also catches a body whose
  declared (or absent) `Content-Length` understates its actual size.

## 9. CORS Configuration

Configured in `config/CorsConfig.java` as a `CorsFilter` registered at highest precedence (so that
even a 413 produced by `MaxBodySizeFilter` still carries CORS headers):

| Environment | Allowed origins |
|---|---|
| Always | `https://regextester.github.io`, plus any origin(s) listed in `ALLOW_CORS` (comma-separated) |
| `ENVIRONMENT` != `production` (default) | Additionally reflects `http(s)://localhost[:port]` origins |
| `ENVIRONMENT=production` | Only the allow-list above — no localhost reflection |

No environment ever emits a wildcard `Access-Control-Allow-Origin: *`, per
`docs/design/api-contract.md` §4.

## 10. OpenAPI Documentation

springdoc-openapi introspects the Spring MVC handler methods and the model records to generate the
document at runtime; `OpenApiConfig` supplies the title/description/version, and
`application.properties` maps the document and UI onto the contract's routes.

## 11. Configuration (environment variables)

| Variable | Default | Description |
|---|---|---|
| `PORT` | 5300 | HTTP listen port (`server.port=${PORT:5300}`) |
| `ENVIRONMENT` | `development` | `production` restricts CORS to the allow-list only (see §9); **must be set as an App Service app setting during provisioning — no deploy workflow sets it** — so an instance without it leaves the local-dev CORS behaviour active |
| `ALLOW_CORS` | *(empty)* | Comma-separated extra allowed CORS origins |
| `COSMOS_CONNECTION_STRING` | *(empty)* | Enables telemetry when set; empty disables it silently |
| `COSMOS_DATABASE` | `regex-tester-db` | Telemetry database name |
| `COSMOS_CONTAINER` | `telemetry` | Telemetry container name |

## 12. Key Differences from the other backends

| Aspect | api-dotnet | api-nodejs | api-python | api-java |
|---|---|---|---|---|
| Runtime | .NET 10.0 | Node.js 22+ | Python >= 3.11 | Java 21 |
| Port | 5000/5001 | 5100 | 5200 | 5300 |
| Regex engine | `System.Text.RegularExpressions` | JavaScript `RegExp` | stdlib `re` | `java.util.regex` |
| `features.captures` | `"multi"` — `Group.Captures` retains every capture of a repeated group | `"single"` | `"single"` | `"single"` — `Matcher` only exposes the last capture per group, so `ShowCaptures` yields a single-element `captures` array |
| Regex timeout enforcement | Native `Regex` timeout | Between-match deadline check | Between-match deadline check | Deadline-checking `CharSequence` — preempts mid-match, unlike the two engines above |
| Telemetry | Azure Cosmos DB | Azure Cosmos DB | Azure Cosmos DB | Azure Cosmos DB — standardized 12-field document, same `/timestamp` partition key, fire-and-forget on a daemon executor (see `TelemetryService.java`) |
| OpenAPI generation | Built-in ASP.NET OpenApi | Custom JSDoc parser | Built-in FastAPI/Pydantic generation | springdoc-openapi introspection |
| Named group syntax | `(?<name>...)` native | `(?<name>...)` native | Translated to `(?P<name>...)` | `(?<name>...)` native, but names are restricted to `[a-zA-Z][a-zA-Z0-9]*` |
| Unicode/Ascii flags | Neither | `Unicode` (`u` flag) | `Ascii` only | `Unicode` only |

The group-name restriction is the one case where an identical pattern legitimately behaves
differently across engines: `(?<my_group>x)` compiles on the other three and is a syntax error on
Java, reported as a normal `error` string.

## 13. Deployment

- **Platform**: Azure App Service (Linux, Java SE 21)
- **URL**: `https://regex-tester-api-java.azurewebsites.net`
- **Port**: 5300 (dev). App Service injects `PORT`.
- **Startup command**: none required — the Java SE image runs `java -jar /home/site/wwwroot/app.jar`,
  which is why `pom.xml` pins `<finalName>app</finalName>`.
- **Required app setting**: `ENVIRONMENT=production` — must be set explicitly on the App Service
  (the code default of `development` is intended for local runs only; deploying without this
  setting would leave the localhost-reflecting CORS rule active in production). No workflow sets it.
- **Deployment package**: `api-java/target/app.jar`, uploaded via `azure/webapps-deploy@v3` by
  `.github/workflows/deploy-api-java.yml`.
