# Plan: Gate all deployments on a green test suite

| | |
|---|---|
| **Date** | 2026-07-25 |
| **Status** | Implemented |
| **Goal** | No backend or frontend deployment may reach Azure or GitHub Pages unless the full cross-backend contract suite has passed for the exact commit being deployed. |

---

## 1. Context (from discovery)

The repository has five workflows:

| Workflow | Trigger | Gated on tests? |
|---|---|---|
| `contract-tests.yml` | `push: [main]`, `pull_request` | n/a — it *is* the test suite |
| `deploy-api-dotnet.yml` | `push: [main]` + `paths: api-dotnet/**`, `workflow_dispatch` | **No** |
| `deploy-api-nodejs.yml` | `push: [main]` + `paths: api-nodejs/**`, `workflow_dispatch` | **No** |
| `deploy-api-python.yml` | `push: [main]` + `paths: api-python/**`, `workflow_dispatch` | **No** |
| `deploy-ui-vuejs.yml` | `push: [main]` + `paths: ui-vuejs/**`, `workflow_dispatch` | **No** |

All five fire **independently and in parallel** on a push to `main`. `contract-tests.yml` has no
relationship of any kind to the four deploy workflows — no `needs`, no `workflow_run`, no status
check. A commit that breaks the API contract is therefore deployed to Azure at the same moment the
test suite is going red, and the deployment still succeeds.

Nothing currently blocks this. Branch protection is not a substitute either: it gates *merges* into
`main`, not the deploy workflows, and `workflow_dispatch` bypasses it entirely.

The contract suite is the only automated test suite in the repo. `ui-vuejs` has **no** test script
(`package.json` exposes only `start`/`dev`/`build`/`build-prod`/`preview`), so the frontend has no
unit tests to run — its only existing self-check is that `npm run build-prod` succeeds.

## 2. Decisions

### D1 — Gate with a reusable workflow (`workflow_call`), not `workflow_run`

`contract-tests.yml` gains an `on: workflow_call:` trigger so the deploy workflows can call it as a
job, and each deploy workflow gets a `test` job plus `needs: test` on its deploy job.

The obvious alternative, triggering deploys `on: workflow_run: [Contract tests]`, is rejected:

- **`workflow_run` cannot use `paths` filters.** All four deploys would fire on every test run, so
  each push would redeploy all three backends and the frontend regardless of what changed.
- **`workflow_run` checks out the wrong commit by default.** It runs against the tip of the default
  branch, not the commit that was tested; you must explicitly check out
  `github.event.workflow_run.head_sha` or you can deploy code that was never tested — the exact bug
  this task exists to fix.
- **It races.** Two pushes in quick succession produce two test runs and two deploy runs whose
  ordering is not guaranteed.

`workflow_call` has none of these problems: the test job and the deploy job live in the **same
workflow run, on the same commit SHA**, and `paths` filters keep working untouched.

### D2 — "All tests" means the full three-engine matrix, for every deploy

Every deploy — including the frontend — waits for the complete `contract-tests` matrix
(`dotnet`, `nodejs`, `python`), not just the engine being deployed.

This is the literal reading of the request and the safer one: the three backends implement **one
shared contract** and the frontend talks to all three, so a red `api-python` is a real signal that
the frontend should not ship either. Gating each backend only on its own engine would let a
contract-wide regression through on the two backends that happen to still pass.

### D3 — Keep the `push: [main]` trigger on `contract-tests.yml`, and accept a duplicate run

Once the deploy workflows call the suite, a push to `main` that touches a deployable path runs the
matrix twice: once from `contract-tests.yml`'s own `push` trigger and once inside the deploy
workflow.

This duplication is accepted deliberately. Removing the `push` trigger would break the "is `main`
green" signal and the README status badge, which points at that workflow's Actions page. The cost is
three extra short-lived jobs on deploy pushes; the failure mode is "tests ran twice", which is
harmless. The alternative failure mode — deploying untested code — is the one being eliminated.

### D4 — No test-skipping escape hatch

`workflow_dispatch` deploys are gated exactly like `push` deploys. A `skip_tests` input would
reintroduce the vulnerability this task closes and would inevitably become the default path during
an incident, which is precisely when it is most dangerous.

### D5 — The frontend gate is the backend matrix plus its own production build

`ui-vuejs` has no tests to add and inventing a token test suite would be theatre. Its build step
already fails the job on a broken build, since workflow steps are sequential and `npm run
build-prod` runs before the Pages deploy step. Adding `needs: test` gives it the contract-suite gate
on top of that.

## 3. Not in scope

- Adding a frontend unit-test suite (worth doing; unrelated to this fix).
- Branch protection / required status checks — repository settings, not files in this repo. Called
  out in `DEPLOYMENT.md` as a recommended complement.
- Changing what the contract suite asserts. This task changes **when deploys run**, never what is
  tested.
- The known `api-nodejs` CORS divergence (localhost origins reflected in every environment).

## 4. Task breakdown

One task, [TASK-14](../tasks/TASK-14-gate-deploys-on-tests.md) — the five workflow files are a
single tightly-coupled change and splitting them would leave the repo in a half-gated state.
