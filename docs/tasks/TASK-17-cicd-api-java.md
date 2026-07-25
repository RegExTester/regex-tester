# TASK-17 — CI/CD: `api-java` deploy workflow and contract-test matrix entry

| | |
|---|---|
| **Phase** | 9 |
| **Depends on** | TASK-15 |
| **Blocks** | — |
| **Plan** | [docs/plan/2026-07-25-add-java-backend.md](../plan/2026-07-25-add-java-backend.md) |
| **Status** | Done |

## Context

TASK-14 made every deploy workflow call `contract-tests.yml` as a gating `test` job, so nothing
reaches Azure or GitHub Pages unless the whole matrix is green for that exact commit. Adding a fourth
engine has two halves:

1. A new deploy workflow for `api-java`, itself gated.
2. A new entry in the `contract-tests.yml` matrix — which means `api-java` immediately gates
   **every other project's** deploys too, exactly as the existing three do.

## Decisions

- Copy `deploy-api-nodejs.yml` verbatim in structure: path-filtered `push: [main]` +
  `workflow_dispatch`, a `test` job with `uses: ./.github/workflows/contract-tests.yml`, and
  `needs: test` on `build-and-deploy`.
- **No new secrets.** Only `AZURE_CREDENTIALS` and `PAGES_DEPLOY_TOKEN` exist. Do not pass
  `secrets: inherit` to the gate job — the suite needs none and the Azure credentials must not be
  exposed to it.
- **No `azure/CLI@v2` step.** That is what once required an `AZURE_RESOURCE_GROUP` secret and broke
  the `api-python` deploy when it was unset. Use `azure/webapps-deploy@v3` inputs instead.
- App Service's Java SE runtime runs `java -jar app.jar` by default, so **no `startup-command` is
  needed** — hence `finalName` is `app` in the pom and the artifact deploys as `app.jar`.
- `actions/setup-java@v4` with `distribution: microsoft`, `java-version: 21`, `cache: maven`, to match
  the JDK the project is built and verified against.
- `ENVIRONMENT=production` is an App Service **app setting**, applied at provisioning time. CI does
  not and must not set app settings (that would reintroduce the `azure/CLI@v2` dependency).

## Deliverables

| File | Change |
|---|---|
| `.github/workflows/deploy-api-java.yml` | New, gated deploy to `regex-tester-api-java`. |
| `.github/workflows/contract-tests.yml` | Add `- engine: java / port: 5300` to the matrix, a conditional `Setup Java` step, and a `Start api-java` step. |

## Acceptance criteria

- All six workflows parse as valid YAML.
- `deploy-api-java.yml` resolves to `test` → `build-and-deploy`, with no secrets on the gate job.
- The `contract-tests.yml` matrix has four entries; the readiness probe (already generic) polls
  `http://localhost:5300/api/capabilities`.
- No workflow references a secret other than `AZURE_CREDENTIALS` / `PAGES_DEPLOY_TOKEN`.

## Out of scope

Branch protection on `main` — a repository setting, not a file, and already noted in `DEPLOYMENT.md`.
