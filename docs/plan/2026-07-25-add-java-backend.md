# Plan: Add a Java backend engine (`api-java`)

| | |
|---|---|
| **Date** | 2026-07-25 |
| **Status** | Implemented |
| **Goal** | Add a fourth backend, `api-java`, implementing the canonical v1 API contract byte-for-byte, so the frontend can switch to a `JAVA` engine with no engine-specific branching. |

---

## 1. Context (from discovery)

Three backends already implement the canonical v1 contract
([docs/design/api-contract.md](../design/api-contract.md),
[docs/open-api/regex-tester-api.v1.yaml](../open-api/regex-tester-api.v1.yaml)):

| Project | Stack | Port | Engine key |
|---|---|---|---|
| `api-dotnet` | .NET 10.0 Web API | 5000 | `DOTNET` |
| `api-nodejs` | Node.js 22 / Express 5 | 5100 | `NODEJS` |
| `api-python` | Python 3.13 / FastAPI | 5200 | `PYTHON` |

The contract is engine-agnostic by design, and §6 of the contract already describes adding a new
backend as a drop-in exercise. This plan therefore **copies the shape of the existing three** rather
than designing anything new. `api-python` is used as the primary reference implementation because it
is the newest and cleanest.

`tests/contract/` (vitest + ajv, 10 spec files) is language-agnostic and validates every response
against the canonical OpenAPI schema plus the behavioural MUST rules. **Passing it unmodified against
`BASE_URL=http://localhost:5300` is the definition of done.**

## 2. Decisions

### D1 — Spring Boot 3.4 on Java 21 (LTS), built with Maven

Each existing backend uses the mainstream, batteries-included framework for its language: ASP.NET
Core, Express, FastAPI. The Java equivalent is Spring Boot, and picking it keeps the "boring,
conventional choice per language" property that makes this repo easy to reason about.

Concretely, Spring Boot supplies out of the box everything the contract needs and every other backend
already has: Jakarta Bean Validation for the field limits, a `CorsFilter` for the origin allow-list,
servlet filters for the body-size guard, `@RestControllerAdvice` for RFC 9457 problem bodies, and
`springdoc-openapi` for `/openapi/v1.json` + an explorer at `/scalar/v1`.

Java **21** because it is the current LTS, is what Azure App Service offers as a Java SE runtime, and
— see D4 — because `Pattern.namedGroups()` requires Java 20+.

Rejected: **Javalin** (would mean hand-rolling validation, OpenAPI generation and error handling —
more bespoke code to keep in sync with three other engines) and **Quarkus** (faster startup, but a
less conventional choice here and more deployment friction on App Service's Java SE runtime).

Maven rather than Gradle: simpler, declarative, and preinstalled on GitHub's `ubuntu-latest` runners,
so CI needs no extra bootstrap step. No Maven Wrapper is committed — consistent with `api-dotnet`
requiring the .NET SDK and `api-python` requiring Python, the toolchain is a documented prerequisite
rather than something vendored into the repo.

### D2 — Port 5300, engine key `JAVA`

Next free port after 5200. `ENGINE_KEY` is declared **once**, in `CapabilitiesService`, and imported
by `TelemetryService`, so the capability document and the telemetry documents can never drift.

### D3 — Flag mapping: six supported bits, everything else a silent no-op

`java.util.regex.Pattern` exposes nine flags. The mapping below is the core engine-specific decision
of this plan.

| Bit | Name | `java.util.regex.Pattern` | Supported |
|---|---|---|---|
| 1 | IgnoreCase | `CASE_INSENSITIVE` | ✅ |
| 2 | Multiline | `MULTILINE` | ✅ |
| 4 | ExplicitCapture | — | ❌ |
| 8 | Compiled | — | ❌ (Java always precompiles a `Pattern`; there is no opt-in) |
| 16 | Singleline | `DOTALL` | ✅ |
| 32 | IgnorePatternWhitespace | `COMMENTS` | ✅ |
| 64 | RightToLeft | — | ❌ |
| *128* | *reserved* | — | *never allocated* |
| 256 | ECMAScript | — | ❌ |
| 512 | CultureInvariant | — | ❌ |
| 1024 | NonBacktracking | — | ❌ |
| 2048 | HasIndices | — | ❌ (Java always reports `start()`/`end()`; nothing to toggle) |
| 4096 | Global | — | ❌ (this API always returns every match — contract §4.1) |
| 8192 | Unicode | `UNICODE_CHARACTER_CLASS` | ✅ |
| 16384 | UnicodeSets | — | ❌ |
| 32768 | ShowCaptures | custom, stripped before compilation | ✅ |
| 65536 | Sticky | — | ❌ (`Matcher.region`/`lookingAt` are call-site concerns, not `Pattern` flags) |
| 131072 | Ascii | — | ❌ (already Java's default for `\w`, `\d`, `\s`, `\b`) |

Two mappings deserve justification:

- **Unicode (8192) → `UNICODE_CHARACTER_CLASS`.** Java's `\w`, `\d`, `\s` and `\b` are ASCII-only by
  default; this flag makes them Unicode-aware, which is the closest analogue to JavaScript's `u`.
  Its javadoc states it *implies* `UNICODE_CASE`, so one flag covers both Unicode-aware character
  classes and Unicode-aware case folding. `api-java` is therefore the second engine (after
  `api-nodejs`) to report bit 8192 as supported.
- **Ascii (131072) → unsupported.** ASCII semantics are Java's *default*, so the honest report is
  `supported: false` rather than pretending to implement a flag that toggles nothing. Reporting it
  supported would imply the inverse behaviour (Unicode by default) that Java does not have.

Every unsupported bit is accepted and silently ignored, per contract §4, and is still listed in
`/api/capabilities` with `supported: false` and `flag: null`.

`defaultOptions` is `IgnoreCase | Multiline` (3), matching the other three engines — and, as the
conformance suite asserts, every bit in it is a supported bit.

### D4 — Named groups via `Pattern.namedGroups()`, not by re-parsing the pattern

Java has historically had no public API to enumerate a pattern's named groups; the usual workaround
is scanning the pattern text for `(?<name>` with another regex. **Java 20 added
`Pattern.namedGroups()`**, returning `Map<String, Integer>` (name → group number), which is exactly
the reverse-lookup `RegexProcessor` needs to label groups. Using it removes a whole class of
pattern-parsing bugs and is a concrete reason to require Java 21 rather than 17.

Java spells named groups `(?<name>...)`, identical to .NET and JavaScript, so — unlike `api-python`,
which must rewrite them to `(?P<name>...)` — **no pattern translation is needed**.

One documented divergence: Java restricts group names to `[a-zA-Z][a-zA-Z0-9]*`, so names containing
an underscore are a compile error here while they are legal on the other three engines. This surfaces
correctly as HTTP 200 with `error` populated, so it is a behavioural difference, not a contract
violation.

### D5 — `features.captures` is `single`

`java.util.regex.Matcher` exposes only the **last** capture of a repeated group, like JavaScript and
Python. Only `api-dotnet` (`Group.Captures`) reports `multi`. The conformance suite's one permitted
engine-conditional assertion reads `features.captures`, so reporting `single` is both truthful and
sufficient.

### D6 — Replacement templates are rewritten from contract syntax to Java syntax

The contract's replacement syntax is .NET-flavoured: `$1`, `${name}`, and `$$` for a literal dollar.
Java's `Matcher.replaceAll` natively understands `$1` and `${name}` — but spells a literal dollar
`\$` and a literal backslash `\\`, and treats a bare `\` as an escape character rather than a
literal.

A single-pass converter therefore rewrites `\` → `\\` and `$$` → `\$`, leaving `$1`/`${name}`
untouched. This is much lighter than `api-python`'s conversion (which has to rewrite every `$n` into
`\n`), because Java and .NET already agree on group references.

Invalid templates (e.g. `$9` when there is no group 9) throw `IndexOutOfBoundsException` /
`IllegalArgumentException`; these are caught and reported as HTTP 200 with `error` populated, never a
5xx.

### D7 — The 15 s regex timeout uses a deadline-checking `CharSequence`

Unlike .NET (`Regex` accepts a `matchTimeout`), Java's regex engine has **no native timeout** and a
catastrophically backtracking pattern will spin forever on the matching thread. Java also cannot
safely kill a thread (`Thread.stop` is removed in Java 20+).

The standard remedy is to feed the matcher a `CharSequence` wrapper whose `charAt()` consults a
deadline and throws once it passes. Backtracking necessarily calls `charAt()`, so the check fires
from inside the engine's own loop. `charAt()` is extremely hot, so the clock is only read every 1024
calls to keep the overhead negligible.

`RegexTimeoutException` is caught in `RegexProcessor` and returned as HTTP 200 with `error`
populated, matching every other engine.

### D8 — The 5 s request timeout uses Spring MVC async, not a filter

`POST /api/regex` returns a `Callable<RegexResult>`, and `spring.mvc.async.request-timeout=5000`
bounds it. On expiry Spring raises `AsyncRequestTimeoutException`, which the
`@RestControllerAdvice` converts into **HTTP 200** with
`{ error: "...timed out...", replace: null, matches: [] }` — overriding Spring's default 503 and
satisfying the contract's "never 408, never an HTTP error status" rule.

This is preferred over a servlet filter that races a worker thread, because two threads writing to
one `HttpServletResponse` is unsafe. The orphaned worker is not leaked: D7's deadline guarantees it
unwinds within 15 s.

Note that, exactly as on the other three engines, the 5 s request timeout will always fire before the
15 s regex timeout on a hot loop. Both limits exist and both are reported in `/api/capabilities`;
this ordering is pre-existing, contract-wide behaviour and is not specific to Java.

### D9 — 413 is enforced by the outermost filter, ahead of CORS-second and validation

`MaxBodySizeFilter` runs at `HIGHEST_PRECEDENCE + 10`, immediately after the `CorsFilter`. It rejects
a request whose `Content-Length` already exceeds 8192 without reading the body at all, and otherwise
wraps the input stream to count bytes as they arrive (covering chunked encoding and clients that
understate their length).

Because it is a filter it runs **before** the `DispatcherServlet`, so an oversized body is always a
413 and never a 400 — even when a field would also have failed its `maxLength` check, which is
precisely what contract §4 requires.

CORS is registered as a `CorsFilter` bean at `HIGHEST_PRECEDENCE` rather than via
`WebMvcConfigurer#addCorsMappings`, specifically so that the 413 produced by the filter chain still
carries CORS headers. Mapping-based CORS is applied inside the `DispatcherServlet` and would be
skipped entirely for filter-generated responses.

### D10 — No wildcard CORS, localhost only outside production

Mirrors `api-python` exactly: allow `https://regextester.github.io`, plus a comma-separated
`ALLOW_CORS` env var, plus — only when `ENVIRONMENT != "production"` — the origin patterns
`http(s)://localhost` and `http(s)://localhost:[*]`.

`ENVIRONMENT` defaults to `development`, like `api-python`, so a bare `java -jar` run allows the
local frontend. **Production must set `ENVIRONMENT=production` as an App Service app setting**; no
workflow sets app settings (see DEPLOYMENT.md §3).

Spring's `allowedOriginPatterns` reflects the *specific* requesting origin, never `*`, so a
disallowed origin receives no `Access-Control-Allow-Origin` header at all.

### D11 — Telemetry mirrors the existing three exactly

Same Cosmos database `regex-tester-db`, same container `telemetry`, same **`/timestamp`** partition
key, same standardized 12-field camelCase document, same silent-disable on an empty
`COSMOS_CONNECTION_STRING`, same never-fail-startup behaviour on a bad one.

Fire-and-forget is implemented with `CompletableFuture.runAsync` on a daemon executor, the Java
equivalent of .NET's `Task.Run`, Node's unawaited promise and FastAPI's `BackgroundTasks`. It is
never awaited on the request path and swallows every exception, so a Cosmos outage cannot turn a
successful match into an HTTP 500 — the exact regression `api-dotnet` once shipped.

The Cosmos SDK (`azure-cosmos`) reads the partition key from the document body, so — like Node and
Python, and unlike .NET — no explicit partition key value is passed on write.

### D12 — Task split follows disjoint file ownership

Telemetry is **not** a separate task, even though the skill's template suggests one, because it lives
entirely under `api-java/**` and would collide with the scaffold task's ownership. Splitting by
directory keeps every task's file set disjoint, which is the property the task index actually relies
on.

## 3. Task breakdown

| Task | Title | Owns |
|---|---|---|
| TASK-15 | New backend: `api-java` (Spring Boot) | `api-java/**`, `.gitignore` |
| TASK-16 | Frontend: register the Java engine | `ui-vuejs/**` |
| TASK-17 | CI/CD: deploy workflow + contract-test matrix | `.github/workflows/**` |
| TASK-18 | Documentation for `api-java` | `README.md`, `ARCHITECTURE.md`, `DEPLOYMENT.md`, `CLAUDE.md`, `docs/**` |

TASK-15 must complete first: TASK-16 needs a live `/api/capabilities` to render options from,
TASK-17 needs the build and start commands, and TASK-18 needs the generated OpenAPI snapshot.
TASK-16, TASK-17 and TASK-18 are mutually disjoint and can run in parallel afterwards.

## 4. Verification

Per [.github/skills/add-engine/references/new-engine-checklist.md](../../.github/skills/add-engine/references/new-engine-checklist.md):

1. `tests/contract` passes unmodified against `BASE_URL=http://localhost:5300`.
2. All three pre-existing backends still pass on 5000, 5100 and 5200.
3. Telemetry proven fire-and-forget: with a syntactically valid but unreachable
   `COSMOS_CONNECTION_STRING`, the app still starts and `POST /api/regex` still returns HTTP 200.
4. `ui-vuejs` builds with `npm run build-prod`, and the carried-bits round trip survives switching
   engines.
5. All workflow YAML parses, and every new relative documentation link resolves.
