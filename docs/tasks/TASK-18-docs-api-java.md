# TASK-18 — Documentation for `api-java`

| | |
|---|---|
| **Phase** | 9 |
| **Depends on** | TASK-15 |
| **Blocks** | — |
| **Plan** | [docs/plan/2026-07-25-add-java-backend.md](../plan/2026-07-25-add-java-backend.md) |
| **Status** | Done |

## Context

Every document that enumerates the backends currently says "three". Adding a fourth engine without
updating them leaves the repo describing a system that no longer exists — and the flag tables in
`CLAUDE.md` and `docs/design/api-contract.md` are the primary reference for what each engine
supports, so a missing Java column is an actual correctness problem, not a cosmetic one.

## Decisions

- `api-java/ARCHITECTURE.md` uses the **same 10 sections** as the other three backend architecture
  documents, so the four can be diffed against each other.
- The Java column is added to **both** flag tables (`CLAUDE.md` and contract §3) and to the engine
  divergence table in contract §7.
- Divergences to document explicitly, because they are deliberate rather than drift:
  - `Unicode` (8192) is supported here and on `api-nodejs` only.
  - `Ascii` (131072) is unsupported because it is Java's default behaviour.
  - Java has no native regex timeout; the 15 s limit is enforced by a deadline-checking
    `CharSequence`.
  - Java restricts named-group names to `[a-zA-Z][a-zA-Z0-9]*`, so `(?<my_group>…)` is a compile
    error here but legal on the other three engines.
- `docs/open-api/api-java.v1.json` is generated from the running server with the
  `node -e "fetch(...)"` command — never PowerShell's `ConvertTo-Json`, which mangles deep structures.

## Deliverables

| File | Change |
|---|---|
| `api-java/ARCHITECTURE.md` | New, 10 sections, mirroring the other backends. |
| `docs/design/api-java.md` | New design doc, mirroring `docs/design/api-python.md`. |
| `docs/open-api/api-java.v1.json` | Generated snapshot. |
| `docs/open-api/README.md` | Regeneration command for the new engine. |
| `docs/design/api-contract.md` | Java column in the §3 flag registry and the §7 divergence table. |
| `README.md` | Project table, quick start, engine list. |
| `ARCHITECTURE.md` | Component diagram, project table, divergences. |
| `DEPLOYMENT.md` | Provisioning, app settings and verification for `regex-tester-api-java`. |
| `CLAUDE.md` | Project table, commands, key files, flag-table column. |

## Acceptance criteria

- No document still claims the repo has three backends.
- Both flag tables carry a Java column consistent with what `/api/capabilities` actually reports.
- Every new relative link resolves to a file that exists.

## Out of scope

Rewriting the existing three backends' architecture documents beyond the counts and tables that the
new engine makes inaccurate.
