# TASK-15 — New backend: `api-java` (Spring Boot)

| | |
|---|---|
| **Phase** | 9 |
| **Depends on** | TASK-02, TASK-14 |
| **Blocks** | TASK-16, TASK-17, TASK-18 |
| **Plan** | [docs/plan/2026-07-25-add-java-backend.md](../plan/2026-07-25-add-java-backend.md) |
| **Status** | Done |

## Context

The canonical v1 contract is engine-agnostic, and contract §6 already describes adding a backend as a
drop-in exercise. This task adds the fourth engine, `api-java`, on **port 5300** with engine key
**`JAVA`**, mirroring the separation of concerns of the existing three (`api-python` is the reference
implementation). Nothing about the contract, the OpenAPI document or the conformance suite changes.

## Decisions

See the plan for the full rationale. The load-bearing ones:

- **D1** — Spring Boot 3.4 / Java 21 / Maven. Java 21 is required, not merely preferred (see D4).
- **D3** — Six supported bits: `IgnoreCase`, `Multiline`, `Singleline`, `IgnorePatternWhitespace`,
  `Unicode` (→ `UNICODE_CHARACTER_CLASS`) and `ShowCaptures`. Every other bit is accepted and
  silently ignored, and still listed with `supported: false` / `flag: null`. `Ascii` is reported
  **unsupported** because ASCII semantics are Java's default — there is no flag to toggle.
- **D4** — Enumerate named groups with `Pattern.namedGroups()` (Java 20+), never by re-parsing the
  pattern. Java spells named groups `(?<name>...)` like .NET/JS, so no pattern translation is needed.
- **D6** — Rewrite replacement templates `\` → `\\` and `$$` → `\$` in a single pass; `$1` and
  `${name}` are already native Java syntax.
- **D7** — 15 s regex timeout via a deadline-checking `CharSequence` (Java has no native regex
  timeout and cannot safely kill a thread). Poll the clock every 1024 `charAt()` calls.
- **D8** — 5 s request timeout via `Callable<RegexResult>` + `spring.mvc.async.request-timeout`;
  `AsyncRequestTimeoutException` is mapped to **HTTP 200**, not Spring's default 503.
- **D9** — 413 enforced by a servlet filter ahead of the `DispatcherServlet`, so an oversized body is
  never reported as 400.
- **D11** — Telemetry identical to the other three: `/timestamp` partition key, 12-field document,
  strictly fire-and-forget.

## Deliverables

| File | Purpose |
|---|---|
| `api-java/pom.xml` | Spring Boot 3.4, Java 21, springdoc, validation, azure-cosmos. `finalName` = `app`. |
| `api-java/.gitignore` | Ignore `target/`. |
| `.../Application.java` | Entry point. |
| `.../config/CorsConfig.java` | `CorsFilter` bean at `HIGHEST_PRECEDENCE` (D9, D10). |
| `.../config/OpenApiConfig.java` | Document metadata; springdoc paths set in `application.properties`. |
| `.../controller/HomeController.java` | `GET /` → 302, `GET /api/capabilities` (24 h cache). |
| `.../controller/RegexController.java` | `POST /api/regex`, returns `Callable` (D8), dispatches telemetry. |
| `.../controller/ApiExceptionHandler.java` | 400 / 413 ProblemDetails, `AsyncRequestTimeoutException` → 200. |
| `.../filter/MaxBodySizeFilter.java` | 8192-byte guard → 413 before parsing (D9). |
| `.../model/*.java` | Records mirroring the canonical schemas. Nulls always emitted. |
| `.../options/RegexOptions.java` | Bit constants, `toPatternFlags`, full option registry. |
| `.../service/RegexProcessor.java` | Matching, groups, captures, replace, 15 s deadline. |
| `.../service/CapabilitiesService.java` | Capability document; declares `ENGINE_KEY`. |
| `.../service/TelemetryService.java` | Fire-and-forget Cosmos writes. |
| `.../TimeLimitedCharSequence.java` | Deadline wrapper backing D7. |
| `api-java/src/main/resources/application.properties` | Port 5300, springdoc paths, async timeout. |

## Acceptance criteria

- `mvn -B package` succeeds; `java -jar target/app.jar` serves on 5300.
- `GET /` → 302 `https://regextester.github.io/`; `GET /api/version` → 404.
- `GET /api/capabilities` → `engineKey: "JAVA"`, `contractVersion: "1.0"`, non-empty
  `runtime.os`/`runtime.framework`, `Cache-Control: max-age=86400`, every option a power of two,
  no bit 128, and `defaultOptions` containing only supported bits.
- `POST /api/regex` honours every MUST rule in contract §4: all fields always emitted, `matches`
  never `null`, regex errors and both timeouts as HTTP 200, 400 ProblemDetails with
  `errors: { field: string[] }`, 413 before parsing.
- **`tests/contract` passes unmodified against `BASE_URL=http://localhost:5300`.**
- With a syntactically valid but unreachable `COSMOS_CONNECTION_STRING`, the app still starts and
  `POST /api/regex` still returns HTTP 200.

## Out of scope

Frontend registration (TASK-16), workflows (TASK-17), documentation (TASK-18).
