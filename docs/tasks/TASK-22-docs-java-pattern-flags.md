# TASK-22 — Documentation and OpenAPI snapshots for the four new flags

| | |
|---|---|
| **Phase** | 15 |
| **Depends on** | TASK-20 |
| **Blocks** | — |
| **Plan** | [docs/plan/2026-07-25-java-pattern-flags.md](../plan/2026-07-25-java-pattern-flags.md) |
| **Status** | Done |

## Context

Four documents carry a per-engine flag table that must stay row-for-row consistent with the
canonical registry, and each `api-*/ARCHITECTURE.md` carries a prose sentence listing the bits that
engine ignores. Both drift silently, because nothing tests prose.

## Decisions

### D1 — Update every live flag table; leave historical records alone

Live: `docs/design/api-dotnet.md`, `api-nodejs.md`, `api-python.md`, `api-java.md`.

Not live, do not touch: `docs/plan/**` and `docs/tasks/TASK-01`…`TASK-18`. Those are point-in-time
records of what was decided then, and rewriting them destroys the audit trail. This repo has an
established convention of leaving them stale.

### D2 — Regenerate the OpenAPI snapshots even though the schema is unchanged

TASK-19 D4 established that no schema edit is needed. The generated per-backend snapshots may still
embed an example or a description that shifts, so regenerate all four and commit only what actually
changes. Use the `node -e "fetch(...)"` command from the skill's repo map — **never**
PowerShell's `ConvertTo-Json`, which mangles nested structures.

## Deliverables

| File | Change |
|---|---|
| `docs/design/api-java.md` | Four rows, all "Supported", with the `Pattern` constant named. Note the `UnicodeCase` / `Unicode` overlap. |
| `docs/design/api-dotnet.md` | Four rows, "No-op". |
| `docs/design/api-nodejs.md` | Four rows, "No-op". |
| `docs/design/api-python.md` | Four rows, "No-op". Extend the engine-comparison table if it lists flags. |
| `api-java/ARCHITECTURE.md` | Update the ignored-bits sentence — Java now ignores four fewer bits. |
| `api-dotnet/ARCHITECTURE.md`, `api-nodejs/ARCHITECTURE.md`, `api-python/ARCHITECTURE.md` | Add the four new names to each ignored-bits sentence. |
| `docs/open-api/*.v1.json` | Regenerate from each running backend. |

## Out of scope

- `docs/design/api-contract.md` and `CLAUDE.md` (TASK-19).
- `docs/open-api/regex-tester-api.v1.yaml` — unchanged by design.
- Backend source, frontend source, tests.

## Acceptance criteria

- [ ] All four per-engine flag tables list 21 flags and agree with §3 of the contract.
- [ ] No `api-*/ARCHITECTURE.md` claims to ignore a bit its engine now supports.
- [ ] Snapshots regenerated from a live backend, not hand-edited.
- [ ] Every relative link in every changed document resolves.

## Report back

Which snapshots actually changed, and confirmation that the four tables agree with §3.
