# TASK-25 — Contract: telemetry initializes synchronously at startup

| | |
|---|---|
| **Phase** | 18 |
| **Depends on** | — |
| **Blocks** | TASK-26, TASK-27 |
| **Plan** | [docs/plan/2026-08-30-telemetry-startup-init.md](../plan/2026-08-30-telemetry-startup-init.md) |
| **Status** | Done |

## Context

Three of the four backends begin serving traffic before their Cosmos client exists and silently
discard the telemetry of every request that arrives in that window — observed directly on
2026-08-30, when the first probe after a credential fix recorded only `DOTNET` and a second probe
moments later recorded all four.

Nothing in the contract says when telemetry must be initialized, so all four engines arrived at a
different answer. This task writes the rule down. Contract first: TASK-26 implements what is
defined here, not the other way round.

## Decisions

### D1 — A behavioural MUST rule, not a schema change

The change is invisible over HTTP: no request or response shape, status code, header or limit is
affected. It therefore belongs in `docs/design/api-contract.md` §4 "Further clarifications",
alongside the other rules that constrain behaviour rather than payloads, and **not** in
`regex-tester-api.v1.yaml`.

An earlier draft added a `telemetry.status` field to `GET /api/capabilities` so the sink's health
would be observable. That is deliberately dropped — see D4 of the plan. Do not reintroduce it as
part of this task.

### D2 — State the bound and the never-fail-startup rule together

A MUST that says only "initialize synchronously" invites the obvious wrong implementation: an
unbounded blocking call that hangs startup when Cosmos is unreachable, converting a telemetry
outage into a total outage. The bound (10 000 ms) and the "MUST NOT prevent the engine from
starting" rule are what make the first sentence safe, so all three appear in one rule.

### D3 — Restate that writes stay fire-and-forget

Initialization becoming blocking is exactly the kind of change that tempts someone to make writes
blocking too "for consistency". api-dotnet once awaited its telemetry write and returned HTTP 500
to users during a Cosmos outage. The rule names the opposite requirement explicitly so the contrast
is deliberate rather than accidental.

### D4 — Add it to the new-backend checklist

§6 is what the next engine's author actually follows. A rule in §4 that is not referenced from §6
will be missed.

## Deliverables

| File | Change |
|---|---|
| `docs/design/api-contract.md` | Add clarification 4 to §4: synchronous startup initialization, the 10 000 ms bound, MUST NOT prevent startup, and writes remaining fire-and-forget. Add a corresponding step to the §6 new-backend checklist, cross-referencing §4. |

## Out of scope

- `docs/open-api/regex-tester-api.v1.yaml` — no schema changes at all.
- Any backend code (TASK-26).
- Architecture and deployment documentation (TASK-27).
- Exposing telemetry health on any endpoint.

## Acceptance criteria

- [ ] §4 contains a numbered clarification requiring synchronous startup initialization, stating the
      10 000 ms bound, and stating that failure MUST NOT prevent startup.
- [ ] The same rule states that writes remain fire-and-forget and never awaited on the request path.
- [ ] §6's checklist includes the requirement and cross-references §4.
- [ ] `docs/open-api/regex-tester-api.v1.yaml` is byte-for-byte unchanged by this task.
- [ ] The canonical YAML still parses and the conformance suite's `Capabilities` validator still
      compiles.

## Report back

The exact text of the new clarification and the checklist step.
