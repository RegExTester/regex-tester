# Architecture

System-level view of RegEx Tester. For a single backend's internal structure, see its own
`ARCHITECTURE.md` ([api-dotnet](api-dotnet/ARCHITECTURE.md), [api-nodejs](api-nodejs/ARCHITECTURE.md),
[api-python](api-python/ARCHITECTURE.md), [api-java](api-java/ARCHITECTURE.md)). There is
deliberately **no** `ui-vuejs/ARCHITECTURE.md` —
the frontend has no meaningful internal "pipeline" to document beyond what's already covered here and
in [docs/design/ui-vuejs.md](docs/design/ui-vuejs.md); this file is its architecture document.

## Component overview

```mermaid
flowchart TD
    subgraph Pages["GitHub Pages (regextester.github.io)"]
        SPA["Browser SPA: ui-vuejs (Vue 3 + Vite)"]
    end

    subgraph Azure["Azure App Service"]
        Dotnet["api-dotnet: .NET 10 / ASP.NET Core"]
        Nodejs["api-nodejs: Node.js 22 / Express 5"]
        Python["api-python: Python 3.13 / FastAPI"]
        Java["api-java: Java 21 / Spring Boot 3.4"]
    end

    Cosmos[("Azure Cosmos DB: regex-tester-db / telemetry")]

    SPA -->|"GET /api/capabilities, POST /api/regex"| Dotnet
    SPA -->|"GET /api/capabilities, POST /api/regex"| Nodejs
    SPA -->|"GET /api/capabilities, POST /api/regex"| Python
    SPA -->|"GET /api/capabilities, POST /api/regex"| Java
    Dotnet -.->|"telemetry, fire-and-forget"| Cosmos
    Nodejs -.->|"telemetry, fire-and-forget"| Cosmos
    Python -.->|"telemetry, fire-and-forget"| Cosmos
    Java -.->|"telemetry, fire-and-forget"| Cosmos
```

The SPA talks to exactly one backend at a time, selected via an engine dropdown; all four
backends are otherwise equivalent from the frontend's point of view because they all implement the
same contract (see below).

## Request flow: one regex evaluation

```mermaid
sequenceDiagram
    participant U as User
    participant B as Browser (ui-vuejs)
    participant A as Selected backend API

    U->>B: Types pattern / text / options
    B->>B: Debounce 800 ms
    B->>B: Base64Url-encode pattern+text, update shareable URL
    B->>A: POST /api/regex { pattern, text, replace, options }
    activate A
    Note over A: 5 s HTTP request timeout races the handler
    A->>A: Compile pattern, run match with a 15 s regex timeout
    alt match completes in time
        A-->>B: 200 { error: null, replace, matches: [...] }
    else regex error or 15 s regex timeout
        A-->>B: 200 { error: "message", replace: null, matches: [] }
    else 5 s request timeout elapses first
        A-->>B: 200 { error: "...timed out...", replace: null, matches: [] }
    end
    deactivate A
    B->>B: Render highlighted matches, groups, captures
```

Every outcome — success, a bad pattern, the 15 s regex timeout, or the 5 s request timeout — is an
HTTP 200 with the result carried in the `error` field. The client never has to special-case an HTTP
error status for a regex-level failure.

## Contract-first design

All four backends implement one canonical OpenAPI 3.1.1 document,
[docs/open-api/regex-tester-api.v1.yaml](docs/open-api/regex-tester-api.v1.yaml), described in
narrative form in [docs/design/api-contract.md](docs/design/api-contract.md). A single
language-agnostic conformance suite ([tests/contract/](tests/contract/), vitest + ajv) validates
every response against that schema plus the behavioural rules in the contract doc, run once per
backend via the `BASE_URL` environment variable. That suite is also the deployment gate: every
deploy workflow calls it as a reusable workflow and will not ship unless all four engines are green
for the commit being deployed (see [DEPLOYMENT.md](DEPLOYMENT.md#7-ci)). A new backend — the contract
doc's own example is `api-rust` — is contract-compliant the moment this suite passes unmodified
against it; no frontend change is required. `api-java` was added exactly that way. See
[docs/design/api-contract.md#6-adding-a-new-backend-eg-rust--checklist](docs/design/api-contract.md#6-adding-a-new-backend-eg-rust--checklist)
for the exact checklist.

## Runtime capability discovery

The frontend does not hard-code which options each engine supports. On every engine switch it
calls `GET /api/capabilities`, which reports `engineKey`, `engineName`, `contractVersion`,
`runtime` (`os`, `framework`), `limits`, `features`, and the full `options[]` registry (each entry
flagged `supported: true/false` for that engine). The UI renders checkboxes only for options the
selected engine actually supports, caches the response, and falls back to a bundled per-engine
config (`ui-vuejs/src/config.dotnet.js` / `config.nodejs.js` / `config.python.js` /
`config.java.js`) if the capability call fails. Because option bits are a single shared bitmask,
bits the current engine doesn't expose are still preserved and re-sent if the user switches back —
switching engines never silently drops a URL's options.

## Cross-cutting concerns

### CORS

No backend ever returns a wildcard `Access-Control-Allow-Origin`. Each allows
`https://regextester.github.io` plus a configurable allow-list (`AllowCors` / `ALLOW_CORS`), and
additionally reflects `http(s)://localhost[:port]` origins only outside production.

### Timeouts

Two independent timeouts, enforced differently per engine (details in each backend's
`ARCHITECTURE.md` §5):

- **15 s regex timeout** — bounds the match/replace itself. Native in .NET
  (`RegexMatchTimeoutException`); a manual deadline check between matches in Node.js and Python,
  since neither `RegExp` nor `re` has a built-in timeout; and a deadline-checking `CharSequence` in
  Java, which — uniquely among the three non-native implementations — can also preempt a single
  catastrophically backtracking match rather than only the gap between matches.
- **5 s HTTP request timeout** — bounds the whole request. All four return **HTTP 200** with
  `{ error: "...timed out...", replace: null, matches: [] }`, never HTTP 408.

### Request body limit and HTTP 413

Every backend caps the raw request body at **8192 bytes**, checked before the body is parsed and
before any field's `maxLength`/`StringLength` is validated. Exceeding it returns HTTP 413 with an
RFC 9457 `ProblemDetails` body. A field that parses but exceeds its own length limit (pattern ≤512,
text/replace ≤1024) returns HTTP 400 with a `ProblemDetails` body and `errors: { field: string[] }`
instead.

### Error semantics

Regex compilation errors and both timeouts are **not** HTTP error codes — they are HTTP 200 with
the `error` field populated and `matches: []`. Only oversized bodies (413) and over-length /
malformed fields (400) are real HTTP error statuses.

### Telemetry

All four backends write an identical 12-field document (`id`, `engineKey`, `timestamp`, `host`,
`userAgent`, `pattern`, `text`, `replace`, `options`, `durationMs`, `matchCount`, `error`) to one
shared Cosmos DB container, `regex-tester-db`/`telemetry`, partitioned on `/timestamp`. Writes are
fire-and-forget on every engine: a Cosmos outage can never affect the response already sent, and an
empty connection string disables telemetry silently without preventing startup. No client IP is
collected. `engineKey` is a plain field on the document, so per-engine queries are cross-partition —
an intentional trade so the partition key stays unchanged and no container ever needs recreating.
See [DEPLOYMENT.md](DEPLOYMENT.md).

## Known deliberate engine divergences

- **Captures**: `GET /api/capabilities` reports `features.captures = "multi"` for api-dotnet
  (`System.Text.RegularExpressions.Group.Captures` retains every capture of a repeated group) and
  `"single"` for api-nodejs, api-python and api-java (`RegExp`/`re`/`Matcher` only expose the last
  capture per group).
- **Always-on flags**: api-nodejs always applies the `g` and `d` regex flags internally regardless
  of the `Global`/`HasIndices` option bits, so it always returns every match with full index data;
  those two bits exist in its capability list for display only.
- **Unicode vs Ascii**: these two bits are opposites of each other and each is supported by exactly
  the engines where it means something. api-nodejs and api-java support `Unicode` (their engines are
  ASCII-by-default and opt in); api-python supports `Ascii` (its engine is Unicode-by-default and
  opts out); api-dotnet supports neither.
- **Java-only `Pattern` flags**: `UnixLines` (262144), `Literal` (524288), `UnicodeCase` (1048576)
  and `CanonicalEquivalence` (2097152) exist in the registry solely because
  `java.util.regex.Pattern` offers them and no other engine of the four does. `UnicodeCase` overlaps
  `Unicode`, since Java's `UNICODE_CHARACTER_CLASS` implies `UNICODE_CASE`; the separate bit exists
  only to request Unicode case folding without Unicode-aware `\w`, `\d`, `\s` and `\b`.
- **Deliberately unallocated**: Python's `re.LOCALE` and `re.DEBUG` are the only native options of
  the four engines with no bit in the registry — the former cannot be used with `str` patterns, and
  the latter writes only to the server's stdout. Every other native option has one.
- **Named group syntax**: api-python rewrites `(?<name>...)` to Python's `(?P<name>...)` before
  compiling. api-java needs no rewriting but restricts group names to `[a-zA-Z][a-zA-Z0-9]*`, so a
  pattern like `(?<my_group>x)` is valid on three engines and a syntax error on Java — reported as a
  normal `error` string, per contract.
- Several contract option bits are no-ops on some engines (e.g. `ExplicitCapture`, `Compiled`,
  `RightToLeft`, `ECMAScript`, `CultureInvariant`, `NonBacktracking` have no Node.js/Python/Java
  equivalent). Unsupported bits are always ignored silently, never rejected, so one bitmask stays
  portable across all four engines. The full flag table is in
  [docs/design/api-contract.md](docs/design/api-contract.md#3-option-flag-registry).

## Projects

| Project | Architecture doc | Design doc |
|---|---|---|
| `api-dotnet` | [api-dotnet/ARCHITECTURE.md](api-dotnet/ARCHITECTURE.md) | [docs/design/api-dotnet.md](docs/design/api-dotnet.md) |
| `api-nodejs` | [api-nodejs/ARCHITECTURE.md](api-nodejs/ARCHITECTURE.md) | [docs/design/api-nodejs.md](docs/design/api-nodejs.md) |
| `api-python` | [api-python/ARCHITECTURE.md](api-python/ARCHITECTURE.md) | [docs/design/api-python.md](docs/design/api-python.md) |
| `api-java` | [api-java/ARCHITECTURE.md](api-java/ARCHITECTURE.md) | [docs/design/api-java.md](docs/design/api-java.md) |
| `ui-vuejs` | *(this document)* | [docs/design/ui-vuejs.md](docs/design/ui-vuejs.md) |

## See also

- [README.md](README.md) — quick start and project overview
- [DEPLOYMENT.md](DEPLOYMENT.md) — Azure provisioning and CI/CD runbook
- [CLAUDE.md](CLAUDE.md) — contributor/agent guide
