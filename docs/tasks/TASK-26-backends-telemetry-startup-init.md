# TASK-26 — Backends: synchronous bounded telemetry initialization

| | |
|---|---|
| **Phase** | 19 |
| **Depends on** | TASK-25 |
| **Blocks** | TASK-27 |
| **Plan** | [docs/plan/2026-08-30-telemetry-startup-init.md](../plan/2026-08-30-telemetry-startup-init.md) |
| **Status** | Done |

## Context

api-nodejs, api-python and api-java begin serving traffic before their Cosmos client is ready;
api-dotnet initializes lazily and blocks the *first user request* instead. This task makes all four
initialize on the startup path, before the process accepts traffic, bounded by a timeout.

## Decisions

### D1 — Initialize on the startup path, before the process accepts traffic

| Backend | Change |
|---|---|
| api-dotnet | Resolve `ITelemetryService` eagerly at the top of `Startup.Configure`, so the existing blocking constructor runs at startup rather than during the first request. |
| api-nodejs | `await telemetryService.initCosmos(...)` before `app.listen(...)`, using ESM top-level `await`. |
| api-python | Already synchronous at import in `src/main.py`; add only the D2 bound. |
| api-java | Run the `@PostConstruct init()` body so the calling thread blocks on it, instead of returning immediately after `executor.execute(...)`. |

api-dotnet's registration stays a singleton *factory* — only the resolution moves. Constructing the
service inside `ConfigureServices` would run network I/O before logging and configuration are fully
wired.

### D2 — Bound initialization at 10 000 ms, enforced outside the SDK

Declared once per backend as a named constant.

The original intent was to use each SDK's own cancellation, so an abandoned attempt could not keep
running unobserved. **Measurement against a blackholed address (`10.255.255.1`) disproved that on
three of the four engines**, so the bound is enforced outside the SDK everywhere:

| Backend | SDK-native mechanism | Result | Enforced bound | Measured |
|---|---|---|---|---|
| api-dotnet | `CancellationToken` on both `…IfNotExistsAsync` calls | overshot, **36.9 s** | `Task.Run(...)` + `Task.Wait(InitTimeout)` | 10.9 s |
| api-nodejs | `abortSignal` in `RequestOptions` | **ignored**, ran to the OS connect timeout, 21.1 s | `Promise.race` against a timer | 10.9 s |
| api-python | `connection_timeout`/`read_timeout`/`timeout` kwargs | overshot, 12.1 s | daemon thread + `Thread.join` | 10.8 s |
| api-java | none exists for these calls | — | `Future.get(10, SECONDS)` on the executor | 12.7 s |

api-java's 12.7 s is the 10 s bound plus Spring Boot's own ~2.7 s startup, not an overshoot.

The Python SDK's timeout kwargs are still passed, because they bound the *abandoned* attempt. Verify
those keyword arguments exist on the pinned SDK version: an unexpected-keyword `TypeError` would be
caught by the existing `except Exception` and would silently disable telemetry entirely —
precisely the failure this work exists to eliminate. (Verified on `azure-cosmos==4.16.2`:
`connection_timeout`, `read_timeout` on the client and `timeout` on both create calls.)

**Do not "simplify" any of these back to SDK cancellation without re-measuring against a blackholed
address.** A bogus *hostname* fails DNS in milliseconds and proves nothing.

### D3 — Failure still never prevents startup

Unchanged and non-negotiable. Every init path keeps its catch-all: log at warning level, leave the
client null, continue starting. An empty connection string remains a silent no-op. A backend that
throws out of startup because Cosmos is unreachable is a worse outcome than the bug being fixed.

For api-java specifically, a `TimeoutException` from `Future.get` must be caught and logged; the
abandoned background attempt is allowed to finish on its own, and if it eventually succeeds it
legitimately leaves a usable client behind.

### D4 — Fire-and-forget writes are unchanged

No write is awaited on the request path and every write exception is still swallowed. api-dotnet
keeps `Task.Run` with `CancellationToken.None`, Node keeps the unawaited promise with `.catch()`,
Python keeps `BackgroundTasks`, Java keeps the single daemon executor thread. api-dotnet used to
await telemetry and returned HTTP 500 during a Cosmos outage; do not regress that.

### D5 — No contract surface changes

No model, schema, endpoint, response field or OpenAPI annotation changes in any backend. If this
task produces a diff in `docs/open-api/api-*.v1.json`, something has gone wrong.

### D6 — `initCosmos` must not reject once awaited (api-nodejs)

Today the rejection is absorbed by a trailing `.catch()`. Once it is awaited at top level in an ESM
module, an unhandled rejection would abort the whole process on startup. The catch must move inside
`initCosmos` so it resolves normally on failure, matching the other three engines.

## Deliverables

| File | Change |
|---|---|
| `api-dotnet/Startup.cs` | Resolve `ITelemetryService` eagerly at the top of `Configure`. |
| `api-dotnet/Services/TelemetryService.cs` | Split the connection into `ConnectAsync`; bound it with `Task.Wait(InitTimeout)`; assign the static Cosmos fields only on success. |
| `api-nodejs/src/services/telemetryService.js` | Bound `initCosmos` with a `Promise.race` timer; catch internally so the promise resolves on failure. |
| `api-nodejs/src/index.js` | `await` `initCosmos(...)` before `app.listen(...)`. |
| `api-python/src/services/telemetry_service.py` | Split the connection into `_connect`; run it on a joined daemon thread bounded by `INIT_TIMEOUT_SECONDS`; keep the SDK timeout kwargs to bound an abandoned attempt. |
| `api-java/.../service/TelemetryService.java` | Block on a bounded `Future.get` in `@PostConstruct`; handle `TimeoutException` without failing startup. |

## Out of scope

- Adding any telemetry health field to `GET /api/capabilities` or anywhere else.
- Changing the telemetry document's 12 fields, the container, or the `/timestamp` partition key.
- Changing when or how often telemetry is written.
- Retrying a failed initialization later in the process lifetime.
- Documentation (TASK-27).

## Acceptance criteria

- [ ] All four backends build (`dotnet build` clean with no new warnings; `mvn package` succeeds) and
      start with no connection string configured.
- [ ] All four backends start successfully with a syntactically valid but unusable connection string,
      taking no longer than roughly the init bound, and log a warning.
- [ ] With a working connection string, the **first** `POST /api/regex` after startup produces a
      telemetry document on **all four** engines — the specific regression this task fixes.
- [ ] `POST /api/regex` still returns HTTP 200 with telemetry broken, on every engine.
- [ ] No write is awaited on the request path on any engine.
- [ ] The conformance suite passes against all four backends.
- [ ] `docs/open-api/api-*.v1.json` regenerate identically (no diff).
- [ ] Every server started during verification is killed.

## Report back

Per engine: where initialization now runs, how the bound is enforced, the exact SDK arguments used,
and the result of the first-request-after-startup check.
