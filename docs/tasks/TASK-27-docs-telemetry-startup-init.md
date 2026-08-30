# TASK-27 — Documentation: telemetry initialization and the stale-key runbook

| | |
|---|---|
| **Phase** | 20 |
| **Depends on** | TASK-26 |
| **Blocks** | — |
| **Plan** | [docs/plan/2026-08-30-telemetry-startup-init.md](../plan/2026-08-30-telemetry-startup-init.md) |
| **Status** | Done |

## Context

Every `api-*/ARCHITECTURE.md` §7 documents the initialization behaviour TASK-26 replaces —
"wrapped in `.catch(...)`", "dispatched onto the background executor", "called once at import
time". Left alone, those become the most authoritative wrong answers in the repository.

Separately, the 2026-08-30 outage that started this work is not recorded anywhere. It cost five
weeks of telemetry and was diagnosable in minutes once the right question was asked. The runbook is
where the next operator will look.

## Decisions

### D1 — Correct §7 in all four backend architecture documents

Each must describe: initialization on the startup path, the 10 000 ms bound and the mechanism used,
and that failure leaves telemetry disabled without preventing startup. No residual claim that
initialization is asynchronous, unawaited, backgrounded, or that it "never blocks startup" —
it does now block startup, deliberately and boundedly.

The fire-and-forget description of *writes* stays exactly as it is. The distinction between blocking
initialization and non-blocking writes is the whole point and must read as deliberate.

### D2 — Record the outage in `DEPLOYMENT.md`, not in a plan

Plans are point-in-time records nobody consults during an incident. The runbook entry must name the
symptom (telemetry silently empty while every endpoint returns HTTP 200), the cause (an account key
rotated after the app settings were written, leaving a stale connection string), and the check that
identifies it in one step: compare the app setting against the account's current connection strings.

Include the diagnostic explicitly, because "the key is stale" is not observable from the API — that
is the trade-off accepted when the capabilities health field was dropped.

### D3 — Do not rewrite history

`docs/plan/2026-07-25-*` and `docs/tasks/TASK-01`…`TASK-24` are point-in-time records. Their
descriptions of the old initialization behaviour stay as written. This repo's established
convention.

### D4 — No OpenAPI snapshot regeneration

TASK-26 changes no models or annotations, so `docs/open-api/api-*.v1.json` must not change.
Regenerating them anyway risks committing springdoc's nondeterministic `components.schemas`
ordering as a spurious diff. Verify they are unchanged instead of refreshing them.

## Deliverables

| File | Change |
|---|---|
| `api-dotnet/ARCHITECTURE.md` | §7: eager resolution in `Configure`, the 10 s `CancellationTokenSource` bound. |
| `api-nodejs/ARCHITECTURE.md` | §7: awaited init before `listen`, the `abortSignal` bound, internal catch. |
| `api-python/ARCHITECTURE.md` | §7: bounded import-time init and the SDK timeout arguments used. |
| `api-java/ARCHITECTURE.md` | §7: blocking bounded `@PostConstruct` via `Future.get`. |
| `ARCHITECTURE.md` | Telemetry section: initialization is synchronous and bounded on all four engines; writes stay fire-and-forget. |
| `DEPLOYMENT.md` | Telemetry troubleshooting entry for the stale-key outage, with the connection-string comparison check. |
| `docs/tasks/README.md` | Register TASK-25 – TASK-27: status table, mermaid graph, wave list, file-ownership table. |

## Out of scope

- Backend behaviour changes (TASK-26).
- `docs/open-api/**` — nothing to regenerate.
- `CLAUDE.md`'s endpoint descriptions — no endpoint changed.
- Rewriting TASK-01…TASK-24 or the 2026-07 plans.

## Acceptance criteria

- [ ] All four `api-*/ARCHITECTURE.md` §7 sections describe bounded synchronous startup
      initialization, and none still describes it as background/unawaited/lazy.
- [ ] All four still describe writes as fire-and-forget.
- [ ] The root `ARCHITECTURE.md` telemetry section distinguishes blocking initialization from
      fire-and-forget writes.
- [ ] `DEPLOYMENT.md` documents the stale-key failure mode and a concrete one-step check.
- [ ] `docs/open-api/api-*.v1.json` are unchanged.
- [ ] Every relative link in every changed document resolves.

## Report back

The list of documents changed and confirmation that the OpenAPI snapshots are untouched.
