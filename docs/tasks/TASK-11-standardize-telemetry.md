# TASK-11 — Standardize telemetry across all three backends

| | |
|---|---|
| **Phase** | 6 |
| **Depends on** | TASK-09, TASK-10 |
| **Blocks** | TASK-12 |
| **Plan** | [docs/plan/2026-07-25-api-contract-and-python-backend.md](../plan/2026-07-25-api-contract-and-python-backend.md) |
| **Status** | Done |

## Context

All three backends are supposed to record usage telemetry into Azure Cosmos DB. Today they do three
different things:

| | api-dotnet | api-nodejs | api-python |
|---|---|---|---|
| Implemented | yes | yes | **no — no-op stub** |
| Cosmos SDK | `Microsoft.Azure.Cosmos` 3.48.0 | `@azure/cosmos` ^4.9.2 | none |
| Failure handling | **awaited — a Cosmos outage returns HTTP 500** | fire-and-forget, errors swallowed | n/a |
| Config source | `Cosmos:*` appsettings section | `COSMOS_*` env vars | `COSMOS_*` env vars (unused) |
| Records which engine wrote it | **no** | **no** | n/a |

Three defects follow from this:

1. **api-dotnet can fail a user's request because of a telemetry outage.** `RegexController` awaits
   `SendTelemetryAsync` before serializing the response, and `CreateItemAsync` is not wrapped. Telemetry
   is non-essential and must never affect the response.
2. **Records are not attributable to an engine.** The documents carry no engine identifier whatsoever, so
   a single shared container cannot answer "which backend served this?" — which is the entire point of
   pooling them.
3. **api-python records nothing**, so Python usage is invisible.

Secondary inconsistencies: `options` is persisted as a *string* on both working backends (so it cannot be
filtered numerically), the user-agent field is spelled `useragent` (not camelCase like every other field),
and there is no record of whether the request actually succeeded.

## Decisions

### D1 — One database, one container, `engineKey` on every document

All three backends write to the same Cosmos database (`regex-tester-db`) and the same container
(`telemetry`). Every document carries a required `engineKey` field whose value is exactly the same
identifier the engine reports from `GET /api/capabilities`: `DOTNET`, `NODEJS`, `PYTHON`.

`engineKey` must be a single hard-coded constant per backend, reused from the capabilities service rather
than re-declared, so the two can never drift.

### D2 — Partition key becomes `/engineKey` — ⚠️ SUPERSEDED

> **Superseded by [TASK-13](TASK-13-telemetry-partition-key-timestamp.md).** The partition key was
> reverted to `/timestamp` precisely because the breaking container change described below was judged
> not worth its cost. The reasoning is preserved here as a record of the original decision; it no
> longer describes the implemented system. `engineKey` remains a field on every document.

The container is currently partitioned on `/timestamp`. Every document has a distinct timestamp, so every
document lands in its own logical partition and any per-engine query is an unbounded cross-partition
fan-out. Partitioning on `/engineKey` makes the natural query ("all telemetry for the Python engine")
single-partition.

The trade-off is low cardinality — 3 logical partitions, each capped at 20 GB. At this project's volume
that is not a practical constraint, and the container runs at 400 RU/s manual throughput, far below the
per-partition ceiling.

**This is a breaking container change.** Cosmos cannot alter the partition key of an existing container,
and `CreateContainerIfNotExists` will silently return the *existing* `/timestamp` container instead of
applying the new key. The migration is therefore a one-time manual step: delete the existing `telemetry`
container (or rename the target via `COSMOS_CONTAINER`) before the new code writes to it. This MUST be
called out in the deployment documentation produced by TASK-12.

### D3 — Telemetry must never affect the response

On all three backends telemetry is fire-and-forget: dispatched *after* the regex result is computed,
never awaited on the request path, and with every exception caught and swallowed (logged server-side at
warning level at most). A telemetry outage, a bad connection string, or a Cosmos throttle MUST NOT change
the status code or body of `POST /api/regex`.

### D4 — Disabled by default

An empty or missing connection string disables telemetry entirely and silently. This is already the
behaviour of the two working backends; keep it, and make api-python behave the same. No backend may fail
to start because telemetry is unconfigured.

## The standardized document

Every backend writes exactly this shape — same field names, same camelCase, same types:

```json
{
  "id": "3f1b0c9e-9d4a-4a7a-9f0e-2b7c5d8e1a44",
  "engineKey": "PYTHON",
  "timestamp": "2026-07-25T11:22:33.445566Z",
  "host": "regex-tester-api-python.azurewebsites.net",
  "userAgent": "Mozilla/5.0 ...",
  "pattern": "\\d+",
  "text": "a1b22c",
  "replace": null,
  "options": 3,
  "durationMs": 12,
  "matchCount": 2,
  "error": null
}
```

| Field | Type | Notes |
|---|---|---|
| `id` | string | A UUID generated per request. |
| `engineKey` | string | `DOTNET` \| `NODEJS` \| `PYTHON`. Partition key. Never null. |
| `timestamp` | string | UTC ISO-8601 with a `Z` suffix. |
| `host` | string | The request `Host` header, or `""`. |
| `userAgent` | string | The `User-Agent` header, or `""`. Renamed from `useragent`. |
| `pattern` | string | The submitted pattern. |
| `text` | string | The submitted text. |
| `replace` | string \| null | The submitted replacement, or null. |
| `options` | **integer** | The raw bitmask. Changed from string so it can be filtered numerically. |
| `durationMs` | integer | Milliseconds spent evaluating the regex — not the whole request. |
| `matchCount` | integer | Number of matches returned; `0` when the pattern errored. |
| `error` | string \| null | The `error` string from the result, or null on success. |

`durationMs`, `matchCount` and `error` are new. Without them the container records only *what* was asked
and never *what happened*, which makes it useless for spotting failures or pathological patterns — the
main reason to collect telemetry at all.

### Privacy

`pattern`, `text` and `replace` are arbitrary user-supplied input and may contain personal data that a
user pasted in. This task does **not** change what is collected, but:

- Do **not** add client IP address collection to any backend. `host` is the server's own hostname and is
  not a client identifier — keep it that way.
- The set of fields collected must be documented in the deployment/architecture docs (TASK-12) so the
  behaviour is at least discoverable.

If you believe any field should be dropped or truncated, report it rather than changing it unilaterally.

## What changes

### api-dotnet
- `Services/TelemetryService.cs` — emit the standardized document; partition on `engineKey`; wrap the
  Cosmos call so no exception can escape; stop awaiting it on the request path.
- `Controllers/RegexController.cs` — dispatch telemetry without blocking the response, passing the
  elapsed regex time, match count and error.
- Reuse the `DOTNET` engine key constant from the capabilities/registry code rather than re-declaring it.
- Keep reading `Cosmos:ConnectionString` / `Cosmos:Database` / `Cosmos:Container`, and confirm the
  standard `COSMOS_CONNECTION_STRING` environment variable also binds (ASP.NET Core maps `__`-delimited
  env vars; document whichever name actually works).

### api-nodejs
- `src/services/telemetryService.js` — same document shape, `/engineKey` partition key, `engineKey`
  sourced from `src/services/capabilities.js`.
- `src/controllers/regexController.js` — pass duration, match count and error; keep it fire-and-forget.

### api-python
- Add the Cosmos SDK (`azure-cosmos`) to `requirements.txt`, pinned to a currently-supported version.
- Replace the `src/services/telemetry_service.py` stub with a real implementation that mirrors the other
  two: lazy client init, disabled when `COSMOS_CONNECTION_STRING` is empty, `/engineKey` partition key.
- Because FastAPI's handler is synchronous and the Cosmos write must not block the response, dispatch the
  write to a background task (FastAPI `BackgroundTasks` or an equivalent) and swallow all errors.
- `src/routers/regex.py` — pass duration, match count and error.
- Update `.env.example` to remove the "currently a no-op stub" comment.

### Shared
- The regex processors already know how long evaluation took, or can be timed at the call site — do not
  add a second regex execution just to measure it.
- No change to `POST /api/regex` request/response shapes, to `GET /api/capabilities`, or to the option
  registry. The API contract is untouched by this task.

## Out of scope

- Any change to the v1 API contract, the canonical OpenAPI spec, or the conformance suite.
- Dashboards, queries, alerting, or retention/TTL policies.
- Writing the deployment or architecture documentation — that is TASK-12.
- Migrating existing telemetry data out of the old `/timestamp` container.

## Acceptance criteria

- [ ] All three backends compile/start with an empty connection string and serve `POST /api/regex`
      normally, writing no telemetry and logging no errors.
- [ ] With telemetry disabled, `tests/contract` still passes against all three backends.
- [ ] Simulating a Cosmos failure (e.g. a syntactically valid but unreachable connection string) does not
      change the status code or body of `POST /api/regex` on any backend.
- [ ] The document builder in each backend produces exactly the 12 fields above, with `options` as an
      integer and `userAgent` in camelCase — verified by inspecting the constructed object, not by
      requiring a live Cosmos account.
- [ ] `engineKey` is `DOTNET` / `NODEJS` / `PYTHON` respectively and is derived from the same constant the
      capabilities endpoint uses.
- [ ] The container is created with partition key path `/engineKey` in all three implementations.
- [ ] No backend collects a client IP address.
- [ ] `azure-cosmos` appears in `api-python/requirements.txt` and the Python service is no longer a stub.
- [ ] `dotnet build` succeeds; all three backends start cleanly.

## Report back

State, per backend: the exact constructed telemetry document; how the write is made non-blocking and how
errors are swallowed; where `engineKey` comes from; and the Cosmos SDK version used. Confirm the
conformance suite still passes on all three. Call out the one-time container recreation needed for the
partition key change, and any field you think poses a privacy risk.
