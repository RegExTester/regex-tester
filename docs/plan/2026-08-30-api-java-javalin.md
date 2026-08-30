# Plan: Replace Spring Boot with Javalin in api-java

| | |
|---|---|
| **Date** | 2026-08-30 |
| **Status** | Proposed |
| **Goal** | Cut api-java's startup time by replacing Spring Boot with Javalin, without changing a single byte of the v1 contract it serves. |

## Context

api-java has by far the slowest startup of the four engines. Measured locally, time to listening with
telemetry disabled:

| Engine | Startup |
|---|---|
| api-dotnet | 0.5 s |
| api-python | 0.9 s |
| api-nodejs | 1.1 s |
| **api-java** | **2.1 s** |

Spring Boot's own log breaks that down precisely:

```
process running for 2.344 s
  ├─ 0.401 s  JVM boot + fat-jar extraction   ← irreducible
  └─ 1.943 s  Spring Boot context             ← the target
       └─ of which springdoc ≈ 0.29 s (measured by disabling it)
```

This matters because the deployment runs on **F1 (Free) App Service plans, which cannot enable
Always On**. Every app unloads after ~20 minutes idle, so every visit after that pays a full cold
start, on a throttled shared core where JVM startup is hit hardest.

### The change is already proven

A throwaway Javalin 6.7 prototype implementing the same contract was built and measured before this
plan was written:

| | Spring Boot 3.4 | Javalin 6.7 |
|---|---|---|
| Startup (best of 3) | 2.31 s | **0.63 s** |
| Fat jar | 51.4 MB | **7.8 MB** |
| Conformance suite | 42/42 | **42/42** |

So this is not a speculative migration. The remaining work is to do it properly in the real project.

## Decisions

### D1 — Javalin 6.7.0 (embedded Jetty)

Mature, servlet-free, and the measured winner. Alternatives considered:

*Rejected: Helidon SE / Vert.x.* Comparable or better startup, but both push the code toward a
reactive style that the synchronous `RegexProcessor` does not need and that would make this engine
read very differently from the other three.

*Rejected: Micronaut / Quarkus.* Both keep a DI container and annotation model — a lot of migration
for a smaller win than Javalin, whose whole point is that there is no container to start.

*Rejected: plain JDK `com.sun.net.httpserver`.* Fastest possible, but we would hand-roll routing,
JSON binding and error handling for a fraction of a second more.

*Rejected: GraalVM native image.* Sub-100 ms starts, but App Service Java SE runs a JAR, not a
container, and the Cosmos SDK plus reflection config make it a much larger project.

### D2 — The contract does not change, and the suite proves it

No endpoint, schema, status code, header, limit or option bit moves. `docs/open-api/api-java.v1.json`
must regenerate **semantically identical**, and all 42 conformance tests must pass. If any test needs
relaxing, the migration is wrong — not the test.

### D3 — Keep generated-from-code OpenAPI via `javalin-openapi-plugin`

The obvious shortcut is to bundle the committed `api-java.v1.json` as a static resource. That is
rejected: springdoc's real value is that the document **cannot drift from the code**, and a
hand-maintained copy silently can.

`io.javalin.community.openapi:javalin-openapi-plugin` 6.7.0-1 keeps that property and improves on it:
its annotation processor generates the document at **compile time**, so unlike springdoc there is no
startup scan at all. The ~0.29 s springdoc costs becomes zero rather than moving elsewhere.

### D4 — Seven Spring mechanisms are replaced explicitly, not approximated

Each is a contract rule, so each gets a direct replacement rather than a framework default:

| Spring mechanism | Javalin replacement |
|---|---|
| `CorsConfig` (`CorsFilter`, highest precedence) | `before` handler reflecting the specific origin, never `*` |
| `@Valid` + `@Size` on `Input` | explicit length checks producing `errors: { field: string[] }` |
| `spring.mvc.async.request-timeout=5000` | `Future.get(5 s)` on a daemon pool → HTTP 200 + `error` |
| `MaxBodySizeFilter` | `cfg.http.maxRequestSize` + a 413 ProblemDetails mapper |
| `ApiExceptionHandler` | explicit status mapping in the handler |
| springdoc | `javalin-openapi-plugin` (D3) |
| DI container | plain constructors in `App` |

**The prototype proved one of these is a genuine trap.** Catching the body-read exception broadly
turned an oversized body into HTTP 400 instead of 413 — exactly the failure Spring's
`ApiExceptionHandler.handleUnreadableBody` unwrapping exists to prevent. The suite caught it. The
Javalin 413 must be rethrown, not swallowed.

### D5 — The regex engine and models port unchanged

`RegexProcessor`, `TimeLimitedCharSequence`, `RegexOptions`, `CapabilitiesService` and all six model
records are framework-independent apart from `@Service` ×2 and `@Size` ×3. Those annotations are
removed; **no logic is touched**. In particular `TimeLimitedCharSequence` — the only mid-match 15 s
timeout preemption among the four engines — is carried over verbatim.

### D6 — Telemetry behaviour is preserved exactly

`TelemetryService` keeps Entra ID auth, the bounded blocking startup init, and fire-and-forget
writes. Only its Spring wiring changes: `@Value` becomes constructor arguments read from the
environment, and `@PostConstruct`/`@PreDestroy` become explicit calls from `App`. The 10 s init bound
and the "never fail startup" rule are unchanged.

## Breaking-change assessment

**None for clients.** The API is byte-for-byte the same.

Operationally:
- The artifact stays `target/app.jar`, so App Service's default `java -jar app.jar` still works and
  `deploy-api-java.yml` needs no change.
- `PORT`, `ENVIRONMENT`, `ALLOW_CORS`, `COSMOS_ENDPOINT`, `COSMOS_DATABASE`, `COSMOS_CONTAINER` are
  all still honoured, with the same defaults.
- `application.properties` disappears; its four settings move into code as named constants.

## Task breakdown

| Task | Scope |
|---|---|
| TASK-30 | api-java: replace Spring Boot with Javalin, preserving the contract |
| TASK-31 | Documentation and the regenerated OpenAPI snapshot |
