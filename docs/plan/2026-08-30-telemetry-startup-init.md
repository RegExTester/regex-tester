# Plan: Synchronous telemetry initialization at startup

| | |
|---|---|
| **Date** | 2026-08-30 |
| **Status** | Implemented |
| **Goal** | Make every backend establish its Cosmos DB telemetry client synchronously during startup, bounded by a timeout, so no request is ever served before the telemetry sink is ready. |

## Context

On 2026-08-30 an investigation found that **no telemetry document had been written by any backend
since 2026-07-26**. All four Azure App Services held a Cosmos DB connection string whose account key
had since been rotated, so every Cosmos call returned HTTP 401. That root cause was fixed by
updating the app settings.

Verifying the fix exposed a second, independent defect. Immediately after the corrected settings
took effect, a probe of all four backends produced **one** telemetry document — `DOTNET` only. A
second probe moments later produced all four. Three of the four engines had begun serving traffic
before their Cosmos client existed, and silently discarded the telemetry for the requests that
arrived in that window.

On App Service, instances restart routinely — deployments, scale events, idle recycling, platform
patching. A window of lost telemetry after every restart is therefore not an edge case; it is
continuous low-grade data loss.

### Current behaviour per backend

| Backend | Where init happens | Blocking? | Ready before the first request? | Bounded? |
|---|---|---|---|---|
| api-dotnet | DI singleton factory, `Startup.ConfigureServices` | Yes — `.Result` | **No** — the factory is lazy, so it runs during the *first* `POST /api/regex` and blocks that user's request | No |
| api-nodejs | `initCosmos(...)` at module load in `src/index.js` | No — promise left unawaited with `.catch()` | **No** — `app.listen()` runs immediately | No |
| api-python | `init_cosmos(...)` at import time in `src/main.py` | **Yes** — a plain synchronous call | **Yes** | No |
| api-java | `@PostConstruct init()` | No — the body is dispatched onto the background `telemetry` executor | **No** | No |

Only api-python initializes the way we want today. api-dotnet — the engine the change request names
as the reference — is not actually initialized at startup either; it merely blocks the first request
instead of losing it, which is why it was the only engine to record the first probe.

No backend bounds how long initialization may take.

### Current failure handling (must be preserved)

Every backend catches every initialization error and leaves telemetry disabled rather than failing.
[`conventions.md`](../../.github/skills/update-be/references/conventions.md) states the rule
directly: *"A bad or unreachable connection string is caught at init so no backend ever fails to
start."* Making initialization synchronous must not regress that, and must not let a hung Cosmos
endpoint turn a telemetry outage into a failed App Service start.

## Decisions

### D1 — All four backends initialize Cosmos synchronously during startup

Initialization moves onto the startup path, before the process accepts traffic:

- **api-dotnet** — resolve the singleton eagerly in `Startup.Configure`, so the existing blocking
  constructor runs at startup instead of during the first request.
- **api-nodejs** — `await initCosmos(...)` (ESM top-level `await`) before `app.listen(...)`.
- **api-python** — already correct; it gains only the D2 bound.
- **api-java** — run the `@PostConstruct init()` work so the startup thread blocks on it, instead of
  returning immediately after `executor.execute(...)`.

*Rejected: keeping lazy initialization and simply warming it up with a synthetic first request.*
Fragile, untestable, and it still loses telemetry if real traffic wins the race.

*Rejected: a readiness gate that withholds traffic until Cosmos is up.* Telemetry is non-essential;
the API must serve regex requests perfectly well with the sink broken.

### D2 — Initialization is bounded at 10 000 ms

A synchronous initialization against a hung endpoint would otherwise block startup indefinitely and,
on App Service, escalate a telemetry outage into a total outage — strictly worse than the data loss
being fixed. Every backend bounds initialization at **10 000 ms**; on expiry it logs a warning,
leaves telemetry disabled, and startup proceeds.

10 s is comfortably above the observed cold cost (a Cosmos handshake plus two `createIfNotExists`
round trips) and far below App Service's container start limit.

Each engine uses its SDK's own cancellation rather than racing a timer, so an abandoned attempt does
not keep running unobserved:

| Backend | Mechanism |
|---|---|
| api-dotnet | `CancellationTokenSource(10s)` token passed to both `…IfNotExistsAsync` calls |
| api-nodejs | `abortSignal: AbortSignal.timeout(10_000)` in the `RequestOptions` of both `createIfNotExists` calls |
| api-python | the `azure-cosmos` sync client's own connection/request timeout arguments |
| api-java | submit to the existing single-thread telemetry executor and `Future.get(10, SECONDS)` on the startup thread |

*Rejected: no bound.* See above.
*Rejected: making the value configurable.* Nothing would ever tune it; a constant is clearer.

#### Measured outcome — SDK cancellation was not enough

The table above was the intended design. Measuring each engine's time-to-listening against a
blackholed address (`10.255.255.1`) showed that **three of the four SDK mechanisms silently
overshoot the budget**, so the bound had to be enforced outside the SDK on every engine:

| Backend | SDK-native mechanism | Enforced bound |
|---|---|---|
| api-dotnet | `CancellationToken` — **36.9 s** for a 10 s token | `Task.Run(...)` + `Task.Wait(10s)` → 10.9 s |
| api-nodejs | `abortSignal` — **ignored entirely**, ran to the OS connect timeout of 21.1 s | `Promise.race` against a 10 s timer → 10.9 s |
| api-python | `connection_timeout`/`read_timeout`/`timeout` — 12.1 s for a 10 s budget | daemon thread + `Thread.join(10s)` → 10.8 s |
| api-java | none available for these calls | `Future.get(10, SECONDS)` → 12.7 s (10 s bound + ~2.7 s Spring startup) |

The SDK timeout arguments are still passed where they work (api-python), because they also bound the
abandoned attempt rather than leaving it to linger. On every engine, a connection that completes
after the bound still publishes its client: it is perfectly usable, it just missed the startup
window.

**Lesson worth keeping:** do not assume a Cosmos SDK honours its own cancellation promptly. Measure
against a blackholed address — a bogus *hostname* fails DNS in milliseconds and proves nothing.

### D3 — Failure still never prevents startup, and writes stay fire-and-forget

Unchanged and non-negotiable. Every initialization path keeps its catch-all: log at warning level,
leave the client null, continue starting. An empty connection string remains a silent no-op.

No write is ever awaited on the request path and every write exception is still swallowed —
api-dotnet keeps `Task.Run` with `CancellationToken.None`, Node keeps the unawaited promise with
`.catch()`, Python keeps `BackgroundTasks`, Java keeps the single daemon executor thread. api-dotnet
once awaited telemetry and returned HTTP 500 during a Cosmos outage; that must not regress.

### D4 — No change to the API contract surface

An earlier draft of this plan also exposed a `telemetry.status` health field on
`GET /api/capabilities`. That was dropped: this change is purely internal to how each process
starts, and adding a required property to a shared response schema is a far larger commitment —
four models, four generated snapshots, a conformance assertion, and a permanently public field —
than the startup fix warrants.

Consequently there is **no HTTP-observable behaviour change** and no new conformance test. The
contract still gains a written MUST rule ([api-contract.md](../design/api-contract.md) §4), because
an unwritten convention is one the next engine will get wrong.

## Breaking-change assessment

**None.** No endpoint, schema, status code, limit, option bit or telemetry document field changes.
`ui-vuejs` is unaffected. The only externally visible difference is that a backend configured with
an unreachable Cosmos endpoint now takes up to 10 seconds longer to start.

## Task breakdown

| Task | Scope |
|---|---|
| TASK-25 | Contract: write the synchronous-initialization MUST rule into the narrative spec |
| TASK-26 | All four backends: synchronous bounded initialization |
| TASK-27 | Architecture and deployment documentation |
