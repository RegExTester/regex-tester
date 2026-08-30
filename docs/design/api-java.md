# api-java — Design Document

> See also: [api-java/ARCHITECTURE.md](../../api-java/ARCHITECTURE.md) for the internal request pipeline, timeout implementation, and telemetry details.

## 1. Overview

Javalin backend for the RegEx Tester application. Implements the [canonical v1 API
contract](api-contract.md) using only the JDK's built-in `java.util.regex` package (no third-party
regex library), providing the same endpoints and response shapes as `api-dotnet`, `api-nodejs` and
`api-python`.

## 2. Technology Stack

- **Runtime**: Java 21 (LTS) — Java 20 is the effective floor, see §5
- **Framework**: Javalin 6.7 (embedded Jetty 11, no DI container)
- **Build**: Maven with `maven-shade-plugin`, producing an executable `target/app.jar`
- **API Docs**: javalin-openapi (Swagger UI), generated at compile time, served on the contract's routes
- **Dependencies**: `javalin`, `javalin-openapi-plugin`, `javalin-swagger-plugin`,
  `jackson-databind`, `slf4j-simple`, `azure-cosmos`, `azure-identity` (see `pom.xml`)

Javalin replaced Spring Boot in 2026-08 solely to cut startup time (2.31 s → 0.70 s) on an F1 App
Service plan that cannot enable Always On. The contract did not change; see
[docs/plan/2026-08-30-api-java-javalin.md](../plan/2026-08-30-api-java-javalin.md).

## 3. Project Structure

```
api-java/
├── src/main/java/io/github/regextester/api/
│   ├── App.java                           # Entry point: routes, CORS, validation, timeout, 413 mapping
│   ├── model/                             # Records mirroring the v1 contract schemas
│   ├── options/
│   │   └── RegexOptions.java              # Option flag registry and bitmask -> Pattern flags
│   └── service/
│       ├── RegexProcessor.java            # Core java.util.regex matching/replace engine, 15s deadline
│       ├── CapabilitiesService.java       # Builds the GET /api/capabilities response body
│       ├── TimeLimitedCharSequence.java   # Deadline-enforcing CharSequence backing the 15s timeout
│       └── TelemetryService.java          # Cosmos DB telemetry, standardized across all four backends (see §12)
├── src/main/resources/simplelogger.properties
└── pom.xml
```

Without a DI container there are no `controller/`, `config/` or `filter/` packages — every HTTP
concern lives in `App`, and the services are plain objects it constructs.

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

The `javalin-openapi` annotation processor generates the document from the `@OpenApi` annotations on
`App`'s handlers and the model records **at compile time**, so it cannot drift from the code and
costs nothing at startup. `OpenApiPlugin` serves it at `/openapi/v1.json` and `SwaggerPlugin` mounts
the UI at `/scalar/v1`.

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
| 262144 | UnixLines | `UNIX_LINES` | Supported — restricts `^`, `$` and `.` to `\n` only, excluding `\r\n`, `\r`, `\u0085`, `\u2028`, `\u2029` |
| 524288 | Literal | `LITERAL` | Supported — the pattern is matched as a literal string |
| 1048576 | UnicodeCase | `UNICODE_CASE` | Supported — see below |
| 2097152 | CanonicalEquivalence | `CANON_EQ` | Supported — pattern `\u00E5` matches text `a\u030A` |

These four are the only bits in the registry that **no other engine supports**;
`java.util.regex.Pattern` is the sole source of them among the four backends.

`UnicodeCase` overlaps `Unicode`: `UNICODE_CHARACTER_CLASS` implies `UNICODE_CASE`, so setting bit
8192 already enables Unicode case folding. Bit 1048576 exists to request that folding on its own —
Unicode-aware casing *without* making `\w`, `\d`, `\s` and `\b` Unicode-aware. Setting both is
harmless and equivalent to setting `Unicode` alone.

`Ascii` being unsupported here is deliberate, not an omission. `\w`, `\d` and `\b` are already
ASCII-only in Java by default, so the bit would have nothing to do; Unicode-aware matching is
opt-*in* via `Unicode`. That is the exact inverse of Python, where matching is Unicode-aware by
default and `re.ASCII` opts out — which is why the two engines support opposite ends of the same
pair.

`options/RegexOptions.java` is the single source of truth for this table (`SUPPORTED_PATTERN_FLAGS`
and `REGISTRY`); unsupported/unknown bits are masked out and silently ignored rather than raising.

## 7. Request Timeout

- **HTTP timeout**: 5 seconds. `App` submits the match to a cached daemon pool and bounds it with
  `Future.get(5, SECONDS)`. On expiry the task is cancelled and the response is HTTP 200 with
  `{ "error": "The request timed out (exceeded 5 seconds).", "replace": null, "matches": [] }` —
  never HTTP 408.
- **Regex timeout**: 15 seconds. `java.util.regex` has no native timeout and `Thread.stop()` was
  removed in Java 20, so the input is wrapped in a `TimeLimitedCharSequence` that checks a
  `System.nanoTime()` deadline every 1024 `charAt()` calls. Because the matcher must read characters
  to make progress, this preempts even a single catastrophically backtracking match — unlike
  api-python's and api-nodejs's between-match deadline checks.

## 8. Validation

- `pattern` ≤ 512 characters, `text` ≤ 1024 characters, `replace` ≤ 1024 characters, checked
  explicitly in `App.validate`; `options` defaults to `0`. The `Input` record carries
  `@OpenApiStringValidation` for the same limits, but that is documentation only — it feeds the
  OpenAPI document and enforces nothing.
- A violation produces an HTTP 400 RFC 9457 `ProblemDetails` body with `errors: { field: string[] }`
  — an array per field, even though only one message per field is possible, because the contract
  requires that shape on every engine.
- Independently of field-level validation, Jetty's `maxRequestSize` (8192 bytes) rejects any
  oversized raw request body while it is being read, and `app.error(413, ...)` renders it as a
  `ProblemDetails` JSON body. Because the limit applies during the read, an oversized body is always
  reported as 413 and never 400, per `docs/design/api-contract.md` §4/§5 — including when one of its
  fields would also have failed its `maxLength` check.

## 9. CORS Configuration

Applied in a Javalin `before` handler in `App`, so that even a 413 still carries CORS headers:

| Environment | Allowed origins |
|---|---|
| Always | `https://regextester.github.io`, plus any origin(s) listed in `ALLOW_CORS` (comma-separated) |
| `ENVIRONMENT` != `production` (default) | Additionally reflects `http(s)://localhost[:port]` origins |
| `ENVIRONMENT=production` | Only the allow-list above — no localhost reflection |

No environment ever emits a wildcard `Access-Control-Allow-Origin: *`, per
`docs/design/api-contract.md` §4.

## 10. OpenAPI Documentation

The `javalin-openapi` annotation processor reads the `@OpenApi` annotations on `App`'s handlers and
the model records during compilation and emits the document into the jar; `OpenApiPlugin` and
`SwaggerPlugin` then serve it and the explorer on the contract's routes. Generating at compile time
rather than by runtime introspection is what keeps the document from drifting while costing no
startup time.

## 11. Configuration (environment variables)

| Variable | Default | Description |
|---|---|---|
| `PORT` | 5300 | HTTP listen port |
| `ENVIRONMENT` | `development` | `production` restricts CORS to the allow-list only (see §9); **must be set as an App Service app setting during provisioning — no deploy workflow sets it** — so an instance without it leaves the local-dev CORS behaviour active |
| `ALLOW_CORS` | *(empty)* | Comma-separated extra allowed CORS origins |
| `COSMOS_ENDPOINT` | *(empty)* | Cosmos account URI; enables telemetry when set, empty disables it silently. Authenticated with Entra ID via `DefaultAzureCredential` — not a key |
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
| OpenAPI generation | Built-in ASP.NET OpenApi | Custom JSDoc parser | Built-in FastAPI/Pydantic generation | javalin-openapi annotation processor, at compile time |
| Named group syntax | `(?<name>...)` native | `(?<name>...)` native | Translated to `(?P<name>...)` | `(?<name>...)` native, but names are restricted to `[a-zA-Z][a-zA-Z0-9]*` |
| Unicode/Ascii flags | Neither | `Unicode` (`u` flag) | `Ascii` only | `Unicode` only |

The group-name restriction is the one case where an identical pattern legitimately behaves
differently across engines: `(?<my_group>x)` compiles on the other three and is a syntax error on
Java, reported as a normal `error` string.

## 13. Deployment

- **Platform**: Azure App Service (Linux, Java SE 21)
- **URL**: `https://regex-tester-api-java-addef8dcgjbqa6bc.centralus-01.azurewebsites.net`
- **Port**: 5300 (dev). App Service injects `PORT`.
- **Startup command**: none required — the Java SE image runs `java -jar /home/site/wwwroot/app.jar`,
  which is why `pom.xml` pins `<finalName>app</finalName>`.
- **Required app setting**: `ENVIRONMENT=production` — must be set explicitly on the App Service
  (the code default of `development` is intended for local runs only; deploying without this
  setting would leave the localhost-reflecting CORS rule active in production). No workflow sets it.
- **Deployment package**: `api-java/target/app.jar`, uploaded via `azure/webapps-deploy@v3` by
  `.github/workflows/deploy-api-java.yml`.
