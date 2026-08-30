# TASK-29 — Azure provisioning and documentation for managed-identity telemetry

| | |
|---|---|
| **Phase** | 22 |
| **Depends on** | TASK-28 |
| **Blocks** | — |
| **Plan** | [docs/plan/2026-08-30-cosmos-managed-identity.md](../plan/2026-08-30-cosmos-managed-identity.md) |
| **Status** | Done |

## Context

TASK-28 makes the backends authenticate to Cosmos with Entra ID. Nothing works until the identities
exist and hold the data role, and the runbook still tells operators to copy an account key.

Separately, investigating hosting cost for this work surfaced two factual errors in `DEPLOYMENT.md`
that make its own troubleshooting advice impossible to follow.

## Decisions

### D1 — Provisioning order is part of the deliverable

Applied in this order so telemetry is never broken by the migration itself:

1. Enable system-assigned identity on all four apps.
2. Assign **Cosmos DB Built-in Data Contributor** (`00000000-0000-0000-0000-000000000002`) to each
   principal at account scope.
3. Set `COSMOS_ENDPOINT` / `Cosmos__Endpoint`. Safe before the code ships — the old code ignores it.
4. Deploy TASK-28.
5. Delete `COSMOS_CONNECTION_STRING` / `Cosmos__ConnectionString`.

Step 5 last, so a rollback to the previous build still has a working key.

### D2 — Document the role choice and why the create calls are gone

The runbook must state that Data Contributor deliberately **cannot** create databases or containers,
so §2's provisioning step is now mandatory rather than a convenience. Without that sentence someone
will eventually delete the container and wait for an app restart to recreate it.

### D3 — Correct the cost note and the Always On advice

Both are wrong today and were written before anyone checked:

- §10 claims an `S1` plan and that the plan and Cosmos are "not free tier". Measured: both plans are
  **F1 (Free)**; the Cosmos account has `enableFreeTier=true` with a 400 RU/s container inside a
  1000 RU/s free allowance and ~28.7 MB against 25 GB — it costs **$0**. The existing advice to
  "switch the container to serverless" would move it off free tier and start charging.
- §9 recommends **Always On** as the cold-start fix, "requires a plan tier that supports it; `S1`
  does". F1 does not support Always On, so as written the fix cannot be applied. Replace with what is
  actually true: F1 cannot do it, B1 is the cheapest tier that can, and a scheduled external ping is
  the free alternative.

### D4 — Keep the stale-key runbook entry, and mark it historical

The 2026-08-30 stale-key entry added in TASK-27 stays, because a reader on an older deployment still
needs it, but it gains a note that key auth has since been replaced and the failure mode no longer
applies to current deployments.

### D5 — Update the shared skill conventions

`.github/skills/*/references/conventions.md` tells future work that telemetry uses a connection
string and that `CreateContainerIfNotExists` is a partition-key trap. Both become wrong. These files
steer every future backend change, so leaving them stale guarantees the next engine reintroduces key
auth.

## Deliverables

| File | Change |
|---|---|
| *(Azure, not a file)* | Enable system-assigned identity on all four web apps; assign the Cosmos data role; set `COSMOS_ENDPOINT`; remove the connection-string settings. |
| `DEPLOYMENT.md` §2 | Note that the container provisioning step is now mandatory. |
| `DEPLOYMENT.md` §3 | Replace the connection-string app settings with `COSMOS_ENDPOINT`; add the identity + role-assignment commands. |
| `DEPLOYMENT.md` §9 | Correct the Always On advice for an F1 plan; mark the stale-key entry historical. |
| `DEPLOYMENT.md` §10 | Correct the plan tier and free-tier claims. |
| `ARCHITECTURE.md` | Telemetry section: Entra ID auth, no keys, container must pre-exist. |
| `api-*/ARCHITECTURE.md` | §7 in all four: credential, endpoint setting, no create calls. |
| `CLAUDE.md` | Telemetry line: managed identity rather than a connection string. |
| `.github/skills/update-be/references/conventions.md` | Telemetry section: managed identity; drop the `CreateContainerIfNotExists` trap. |
| `.github/skills/add-engine/references/conventions.md` | Same. |
| `docs/tasks/README.md` | Register TASK-28 and TASK-29. |

## Out of scope

- Backend code (TASK-28).
- Moving off F1, or adding the keep-alive workflow — the corrected §9 documents the options without
  implementing them.
- Rewriting historical plans and TASK-01…TASK-27.

## Acceptance criteria

- [ ] All four web apps report a system-assigned principal ID.
- [ ] Four Cosmos SQL role assignments exist for role `…0002` at account scope.
- [ ] All four apps have `COSMOS_ENDPOINT` (or `Cosmos__Endpoint`) and **no** connection-string setting.
- [ ] All four deployed backends write telemetry after the change.
- [ ] `DEPLOYMENT.md` contains no `AccountKey`/connection-string instruction for telemetry.
- [ ] No document still claims an `S1` plan, "not free tier", or that Always On is available here.
- [ ] No document or skill reference still describes telemetry auth as a connection string.
- [ ] Every relative link in every changed document resolves.

## Report back

The four principal IDs (non-secret), the role assignment IDs, and confirmation that deployed
telemetry writes succeed with no key present anywhere.
