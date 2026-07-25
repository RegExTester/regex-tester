---
name: update-be
description: 'Plan and execute a change request across all backend (BE) engines in this mono-repo. Use when asked to change, add, remove or fix behaviour in the APIs — endpoints, option flags, validation, limits, timeouts, error semantics, CORS, telemetry, OpenAPI — or when a change must stay consistent across api-dotnet, api-nodejs and api-python. Writes a plan to docs/plan/, task specs to docs/tasks/, updates every backend, then updates the ui-vuejs frontend if the contract surface changed. Triggers: "change the API", "update all backends", "add an option flag", "modify the contract", "keep the backends in sync".'
argument-hint: 'Describe the change request'
---

# Update Backends (change request workflow)

All backends implement **one canonical contract**. A change is not done when one backend works —
it is done when all of them behave identically and the conformance suite proves it.

## Order of operations (do not reorder)

Contract first, then implementations, then frontend, then docs. Implementing first and
back-filling the contract is how the engines drift.

1. **Discover** — read the contract and *all* backends before proposing anything.
2. **Plan** → `docs/plan/YYYY-MM-DD-<slug>.md`
3. **Tasks** → `docs/tasks/TASK-NN-<slug>.md` + register in `docs/tasks/README.md`
4. **Contract** → update `docs/open-api/regex-tester-api.v1.yaml` and `docs/design/api-contract.md`
5. **Backends** → api-dotnet, api-nodejs, api-python
6. **Frontend** → only if the contract surface changed
7. **Verify** → build + run all three + conformance suite
8. **Commit**

See [references/repo-map.md](./references/repo-map.md) for file layouts, ports and run commands.
See [references/conventions.md](./references/conventions.md) for the contract rules that must not be broken.

## 1. Discover

Read, do not assume:

- [docs/design/api-contract.md](../../../docs/design/api-contract.md) — narrative spec
- [docs/open-api/regex-tester-api.v1.yaml](../../../docs/open-api/regex-tester-api.v1.yaml) — canonical schema
- [ARCHITECTURE.md](../../../ARCHITECTURE.md) and each `api-*/ARCHITECTURE.md`
- The actual source in **all three** backends for the area you are changing

Report what each backend does *today* before proposing the change. Engines often already diverge;
find that first. If the code and the docs disagree, the code wins — and fix the doc.

## 2. Write the plan

`docs/plan/YYYY-MM-DD-<slug>.md`, following the existing plan's shape:

- Header table: Date, Status (`Proposed` → `Implemented`), Goal
- Context from discovery, including a **current-behaviour-per-backend table**
- The decisions, each with rationale and rejected alternatives
- Breaking-change assessment
- A task breakdown that maps to the task files you will write

## 3. Write task specs

One file per independently-executable unit: `docs/tasks/TASK-NN-<slug>.md`. Use the next free NN.
Match the existing structure exactly:

- Header table: Phase, Depends on, Blocks, Plan (link), Status
- `## Context`
- `## Decisions` (`### D1 — ...`) with the reasoning, so an executor cannot silently re-decide
- `## Deliverables` — **per file**, explicit
- `## Out of scope`
- `## Acceptance criteria` — checkbox list, each item objectively verifiable
- `## Report back`

Then update [docs/tasks/README.md](../../../docs/tasks/README.md): the status table row, the mermaid
dependency graph, the wave list, and the **file-ownership table** (tasks running in parallel must own
disjoint files).

## 4. Change the contract

If the request changes any request/response shape, status code, limit or flag:

- Update `docs/open-api/regex-tester-api.v1.yaml` (canonical, hand-maintained) **first**
- Update `docs/design/api-contract.md` to match
- If option flags change, update the flag table in [CLAUDE.md](../../../CLAUDE.md). **Bit 128 is
  permanently reserved and must never be allocated.**
- Regenerate the per-backend snapshots *after* the backends are updated — see
  [references/repo-map.md](./references/repo-map.md) for the exact regeneration command.

## 5. Update every backend

Apply the change to **all three**. A per-engine no-op is still an explicit decision: report it in
`GET /api/capabilities` as `supported: false` rather than silently ignoring it.

Cross-check the parity items in [references/conventions.md](./references/conventions.md) — every one of
them is a rule the conformance suite or a past bug already enforces.

## 6. Update the frontend

Only needed when the contract surface changed. `ui-vuejs` is capability-driven: it renders options from
`GET /api/capabilities`, so a new flag usually needs **no frontend change**.

It does need changes when: limits change (input maxlengths), the capabilities shape changes, or a new
engine appears. Preserve the **carried-bits** behaviour — bits the current engine does not expose must
survive a round trip through the URL. See [references/conventions.md](./references/conventions.md).

## 7. Verify — independently, never on trust

Do not accept a subagent's word. Run it yourself. Commands are in
[references/repo-map.md](./references/repo-map.md).

- [ ] `dotnet build` clean, no new warnings
- [ ] All three backends start
- [ ] Conformance suite passes against **each** of 5000, 5100, 5200
- [ ] New behaviour has a new conformance test — a change with no test is not done
- [ ] Frontend builds; if touched, verified in a browser against every engine
- [ ] Every relative link in changed docs resolves
- [ ] **Kill every server you started**

## 8. Commit

Explain *why*, note breaking changes with `!`, and state how you verified. Do not push unless asked.

## Delegating to subagents

For large mechanical work, one subagent per backend with disjoint file ownership. Always tell them:

- **Never run any git command** — the orchestrator commits
- **Kill every server you start**
- Do not touch files outside your ownership list
- PowerShell 5.1: `;` not `&&`

Then verify their work yourself. Subagent reports are routinely truncated, and truncated reports have
concealed real defects here more than once.
