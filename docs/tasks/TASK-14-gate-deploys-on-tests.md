# TASK-14 — Gate all deployments on a green test suite

| | |
|---|---|
| **Phase** | 8 |
| **Depends on** | TASK-08, TASK-13 |
| **Blocks** | — |
| **Plan** | [docs/plan/2026-07-25-gate-deploys-on-tests.md](../plan/2026-07-25-gate-deploys-on-tests.md) |
| **Status** | Done |

## Context

The four deploy workflows and `contract-tests.yml` fire independently and in parallel on a push to
`main`. There is no `needs`, no `workflow_run` and no status check linking them, so a commit that
breaks the API contract is deployed to Azure while the test suite is going red. `workflow_dispatch`
deploys are equally ungated.

## Decisions

### D1 — Reusable workflow, not `workflow_run`

`contract-tests.yml` gains `on: workflow_call:` (keeping its existing `push`/`pull_request`
triggers). Each deploy workflow gains:

```yaml
jobs:
  test:
    uses: ./.github/workflows/contract-tests.yml

  build-and-deploy:
    needs: test
    ...
```

`workflow_run` is rejected: it cannot use `paths` filters, it checks out the default-branch tip
rather than the tested commit unless `github.event.workflow_run.head_sha` is passed explicitly, and
it races on rapid successive pushes. `workflow_call` keeps the test and deploy jobs in the **same
run on the same SHA**, and leaves `paths` filters working.

### D2 — Every deploy waits for the full three-engine matrix

Including `deploy-ui-vuejs`. The backends share one contract and the frontend talks to all three, so
a red `api-python` must block a frontend deploy too.

### D3 — No skip-tests input on `workflow_dispatch`

Manual deploys are gated identically. An escape hatch would reintroduce exactly the hole being
closed.

## Deliverables

| File | Change |
|---|---|
| `.github/workflows/contract-tests.yml` | Add `workflow_call:` to `on:`. No change to the matrix, steps or assertions. |
| `.github/workflows/deploy-api-dotnet.yml` | Add `test` job calling the reusable workflow; add `needs: test` to `build-and-deploy`. |
| `.github/workflows/deploy-api-nodejs.yml` | Same. |
| `.github/workflows/deploy-api-python.yml` | Same. |
| `.github/workflows/deploy-ui-vuejs.yml` | Same. |
| `DEPLOYMENT.md` | Document the gate; recommend branch protection as a complement; note that a failed suite blocks the deploy. |
| `ARCHITECTURE.md` | Update the CI/CD description if it claims deploys are independent. |

### Job-level constraints to respect

A job that uses `uses:` **cannot** also declare `steps`, `defaults`, `runs-on` or `env`. The existing
`defaults: run: working-directory:` blocks in the deploy workflows are **job-level**, on
`build-and-deploy`, so they are unaffected — do not hoist them to workflow level.

The reusable workflow needs **no** secrets, so no `secrets:` or `secrets: inherit` is required. Do
not add `secrets: inherit` "just in case": it would hand the Azure credentials to the test job for
no reason.

## Out of scope

- Adding a frontend unit-test suite.
- Configuring branch protection (a repository setting, not a file).
- Changing what the contract suite asserts.

## Acceptance criteria

- [ ] `contract-tests.yml` declares `workflow_call` alongside `push` and `pull_request`.
- [ ] All four deploy workflows have a `test` job that calls `./.github/workflows/contract-tests.yml`.
- [ ] All four `build-and-deploy` jobs declare `needs: test`.
- [ ] No deploy workflow passes secrets to the test job.
- [ ] `paths` filters and `workflow_dispatch` triggers are preserved on all four deploy workflows.
- [ ] No `skip_tests`-style bypass input exists.
- [ ] Every workflow file parses as valid YAML.
- [ ] The Azure/Pages deploy steps are unchanged apart from the added `needs`.
- [ ] `DEPLOYMENT.md` documents the gate.
- [ ] No application code is touched — the diff contains only workflow YAML and Markdown, so runtime
      behaviour and the contract suite's result are unchanged by construction.

## Report back

The `needs:`/`uses:` wiring added per workflow, confirmation that no secrets are passed to the test
job, and the YAML validation result.
