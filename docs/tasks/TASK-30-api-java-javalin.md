# TASK-30 — api-java: replace Spring Boot with Javalin

| | |
|---|---|
| **Phase** | 23 |
| **Depends on** | TASK-28 |
| **Blocks** | TASK-31 |
| **Plan** | [docs/plan/2026-08-30-api-java-javalin.md](../plan/2026-08-30-api-java-javalin.md) |
| **Status** | Done |

## Context

api-java starts in 2.31 s against 0.5–1.1 s for the other three engines, and the deployment runs on
F1 plans that cannot enable Always On, so every idle period ends in a full cold start. Spring Boot
accounts for 1.94 s of that 2.34 s. A measured Javalin 6.7 prototype serves the identical contract in
0.63 s and passes all 42 conformance tests.

## Decisions

### D1 — The contract is frozen; the suite is the arbiter

No endpoint, schema, status code, header, limit or option bit changes. All 42 conformance tests must
pass and `docs/open-api/api-java.v1.json` must regenerate semantically identical. A failing test
means the migration is wrong; do not relax a test to accommodate it.

### D2 — Port the engine unchanged, rewrite only the HTTP layer

**Carried over with annotations stripped and no logic changed:**
`RegexProcessor` (`@Service`), `CapabilitiesService` (`@Service`), `Input` (`@Size` ×3),
`TimeLimitedCharSequence`, `RegexOptions`, and the model records `Capabilities`, `CaptureResult`,
`GroupResult`, `MatchResult`, `RegexResult`, `ProblemDetailsResponse`.

`TimeLimitedCharSequence` gives this engine the only mid-match 15 s timeout preemption of the four —
carry it verbatim.

**Deleted, replaced by `App`:** `Application`, `CorsConfig`, `OpenApiConfig`, `ApiExceptionHandler`,
`HomeController`, `RegexController`, `MaxBodySizeFilter`, and `application.properties`.

### D3 — Rethrow Javalin's 413; never swallow it

Javalin enforces `cfg.http.maxRequestSize` by throwing *while the body is being read*, i.e. from
inside the same `bodyAsClass` call that also throws on malformed JSON. A broad `catch` therefore
reports an oversized body as HTTP 400.

**The prototype hit exactly this and failed `validation.spec.js` with "expected 400 to be 413".** It
is the same hazard Spring's `ApiExceptionHandler.handleUnreadableBody` unwrapping exists to prevent.
Catch `HttpResponseException` first and rethrow so the 413 mapper runs.

### D4 — Keep OpenAPI generated from code

Use `io.javalin.community.openapi:javalin-openapi-plugin` + `openapi-annotation-processor` 6.7.0-1.
Its processor runs at compile time, so the document cannot drift from the handlers *and* there is no
startup scan — springdoc's ~0.29 s becomes zero rather than moving.

Serving a bundled static copy of `api-java.v1.json` is explicitly rejected: it silently drifts.

### D5 — Replace each Spring mechanism deliberately

Every one encodes a contract rule that the conformance suite checks:

- **CORS** — a `before` handler that reflects the *specific* `Origin`, never `*`, allowing
  `https://regextester.github.io` plus `ALLOW_CORS`, and `http(s)://localhost[:port]` only when
  `ENVIRONMENT != production`. It must also cover error responses, which is why Spring used a
  highest-precedence filter rather than MVC mappings.
- **Validation** — explicit length checks (512/1024/1024) producing
  `errors: { field: [message] }`, an array per field even for a single violation.
- **5 s request timeout** — `Future.get` on a daemon pool; on expiry HTTP **200** with an
  `error`-populated body. Never 408, never 503.
- **413** — `cfg.http.maxRequestSize = 8192` plus a ProblemDetails mapper, applied before the body is
  parsed and before any field-length check.

### D6 — Telemetry keeps its current semantics

Entra ID via `DefaultAzureCredential`, bounded 10 s blocking init on the startup path, fire-and-forget
writes on a single daemon thread, never failing startup. Only the wiring changes: `@Value` →
constructor arguments from the environment, `@PostConstruct`/`@PreDestroy` → explicit calls from
`App`. Do not take the opportunity to "simplify" the init bound away.

### D7 — The artifact contract with App Service is unchanged

`<finalName>app</finalName>` stays, so `target/app.jar` still exists and App Service Java SE's default
`java -jar app.jar` keeps working. `deploy-api-java.yml` must need no edit. Java 21 stays a hard
requirement (`Pattern.namedGroups()`).

## Deliverables

| File | Change |
|---|---|
| `api-java/pom.xml` | Drop `spring-boot-starter-parent`, web, validation, springdoc. Add Javalin 6.7.0, the OpenAPI plugin + annotation processor, Jackson, slf4j-simple. Keep azure-cosmos + azure-identity. Replace `spring-boot-maven-plugin` with `maven-shade-plugin`, `finalName` = `app`. |
| `api-java/.../App.java` | **New.** Wiring, routes, CORS, validation, timeout, 413 mapping, telemetry lifecycle. |
| `api-java/.../service/RegexProcessor.java` | Remove `@Service` + import. No logic change. |
| `api-java/.../service/CapabilitiesService.java` | Remove `@Service` + import. No logic change. |
| `api-java/.../service/TelemetryService.java` | Replace `@Value`/`@Service`/`@PostConstruct`/`@PreDestroy` with constructor args and explicit `init()`/`shutdown()`. |
| `api-java/.../model/Input.java` | Remove `@Size` + import; keep the limits in the javadoc. |
| `api-java/.../Application.java` | **Delete** (replaced by `App`). |
| `api-java/.../config/CorsConfig.java` | **Delete.** |
| `api-java/.../config/OpenApiConfig.java` | **Delete.** |
| `api-java/.../controller/*.java` | **Delete** all three. |
| `api-java/.../filter/MaxBodySizeFilter.java` | **Delete.** |
| `api-java/src/main/resources/application.properties` | **Delete**; settings become constants in `App`. |

## Out of scope

- Any change to the other three backends, the frontend, or the canonical contract.
- Documentation and the regenerated snapshot (TASK-31).
- Changing telemetry behaviour, the regex engine, or the option registry.
- CDS, GraalVM, or JVM tuning flags.

## Acceptance criteria

- [x] `mvn package` succeeds and produces `target/app.jar`.
- [x] All **42** conformance tests pass against `http://localhost:5300`.
- [x] Startup to listening is **under 1 s** with telemetry disabled (Spring baseline: 2.31 s).
- [x] `GET /openapi/v1.json` and `GET /scalar/v1` both serve.
- [~] `docs/open-api/api-java.v1.json` regenerates semantically identical (deep-key-sorted compare).
      **Not met literally** — see "Result" below.
- [x] With a valid `COSMOS_ENDPOINT`, the **first** `POST /api/regex` after startup writes telemetry.
- [x] With `COSMOS_ENDPOINT` empty, the app starts and telemetry is a silent no-op.
- [x] No `org.springframework` or `jakarta.validation` reference remains under `api-java/src`.
- [x] Every server started during verification is killed.

## Result

| Measure | Spring Boot 3.4.1 | Javalin 6.7.0 |
|---|---|---|
| Startup to listening (telemetry off) | 2.31 s | **0.70 s** |
| Startup to listening (telemetry on) | ~6 s | ~6 s (dominated by the 3.1 s Cosmos client build) |
| `target/app.jar` | 51.4 MB | 38.8 MB |
| Conformance | 42/42 | 42/42 |

The telemetry-enabled figure is unchanged by design: `init()` is deliberately blocking and on the
startup path (TASK-25/26/27), so the Cosmos client build dominates. Javalin itself reports
`started in 101ms`.

### OpenAPI snapshot: 44 residual differences, all generator idiom

Every piece of *documented content* was preserved, but only after explicitly restoring what the
swap would otherwise have dropped: `operationId`s, response descriptions, `requestBody.required`,
the `info` block, and the `Input` field limits (via `@OpenApiStringValidation`, which is
documentation-only — enforcement lives in `App.validate`).

What remains cannot be reconciled, because it is how the two generators differ:

| Difference | Assessment |
|---|---|
| `openapi: 3.0.1` → `3.0.3` | Cosmetic. |
| `servers: [localhost:5300]` → `[]` | **Better** — springdoc baked a local URL into a committed file. |
| `content: */*` → `application/json` | **Better** — the responses really are JSON. |
| `operationId: "post"` → `"regex"` | **Better** — `post` was a springdoc default, not a name. |
| `additionalProperties: false` and `required` arrays added | **Better** — accurately reflects the records. |
| `parameters: []`, `deprecated: false`, `security: []`, `securitySchemes: {}`, `security: null` added | Generator noise. `security: null` at the root is untidy but tolerated by Swagger UI. |
| `maxLength: 512` → `"512"` | **Worse.** `@OpenApiStringValidation` takes `String`, and the processor emits it verbatim, so the value is a JSON string where JSON Schema wants a number. Kept regardless: stating the limit imprecisely beats omitting it, and `GET /api/capabilities` remains the authoritative, correctly-typed source. |

This file is documentation only — the conformance suite validates against
`docs/open-api/regex-tester-api.v1.yaml`, not this snapshot — so none of the above affects the
contract.

### Beyond the deliverables table

- `api-java/src/main/resources/simplelogger.properties` was added. slf4j-simple defaults to
  `System.err`, which App Service's log stream classifies as errors; Spring Boot's logback wrote to
  stdout. Without this, every normal log line would have started appearing as an error. Verified:
  stderr 0 bytes, stdout 1002 bytes on a clean start.
- `javalin-swagger-plugin` had to be added alongside `javalin-openapi-plugin` — the UI ships as a
  separate artifact from the document generator.
- `CapabilitiesService` referenced `MaxBodySizeFilter.MAX_REQUEST_BODY_BYTES`. Both limits now live
  in `App` and `CapabilitiesService` mirrors them, preserving the single-source-of-truth property.

`.github/workflows/deploy-api-java.yml` needed no change, as intended by D7.
