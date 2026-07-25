# TASK-08 — CI/CD workflows and documentation

| | |
|---|---|
| **Phase** | 5 |
| **Depends on** | TASK-01, TASK-03, TASK-04, TASK-05, TASK-06, TASK-07 |
| **Blocks** | Nothing — final task |
| **Plan** | [docs/plan/2026-07-25-api-contract-and-python-backend.md](../plan/2026-07-25-api-contract-and-python-backend.md) |
| **Status** | Done |

## Context

Final task: ship `api-python` through CI/CD, wire the conformance suite into CI, and bring all
documentation in line with the three-backend / one-frontend reality.

## What changes

### 1. `.github/workflows/deploy-api-python.yml`

Model it on the existing `.github/workflows/deploy-api-nodejs.yml` — read that file first and keep the
same structure, action versions, and secret names.

```yaml
name: Deploy api-python to Azure
on:
  push:
    branches: [main]
    paths:
      - 'api-python/**'
      - '.github/workflows/deploy-api-python.yml'
  workflow_dispatch:
env:
  AZURE_WEBAPP_NAME: regex-tester-api-python
  PYTHON_VERSION: '3.13'
```

- `defaults.run.working-directory: api-python`
- `actions/checkout@v4`, `actions/setup-python@v5` with pip caching keyed on
  `api-python/requirements.txt`
- Build a deployment package: copy `src/` and `requirements.txt` into a `deploy/` directory and
  `pip install --target deploy/.python_packages/lib/site-packages -r requirements.txt`
  (the Oryx-free layout Azure App Service expects), or use the standard Oryx build — choose one and
  document it in the workflow with a comment.
- `azure/login@v2` with `creds: ${{ secrets.AZURE_CREDENTIALS }}`
- `azure/webapps-deploy@v3` with `app-name: ${{ env.AZURE_WEBAPP_NAME }}` and `package: deploy`
- Set the App Service startup command (via `azure/CLI` or a `startup.txt`) to
  `python -m uvicorn src.main:app --host 0.0.0.0 --port $PORT`

### 2. `.github/workflows/contract-tests.yml`

Runs the TASK-06 suite against all three backends on every PR and push to `main`.

- Three jobs (or one job with a matrix), each: check out, set up the runtime, install, start the backend in
  the background, wait for the port to accept connections, then run
  `cd tests/contract && npm ci && BASE_URL=<url> npm test`.
- Backends and ports: api-dotnet `http://localhost:5000`, api-nodejs `http://localhost:5100`,
  api-python `http://localhost:5200`.
- Use a bounded readiness poll against `/api/version` — do not use a fixed sleep.
- The workflow must fail the build if any backend fails the suite.

### 3. `docs/design/api-python.md`

Mirror the section structure of `docs/design/api-nodejs.md` exactly:

1. Overview
2. Technology Stack
3. Project Structure (directory tree with per-file descriptions)
4. API Endpoints (with request/response examples)
5. Core Service: RegexProcessor
6. Regex Options — contract flags to Python `re` mapping
7. Request Timeout (5s HTTP / 15s regex)
8. Validation (limits and the 400 ProblemDetails body)
9. CORS Configuration
10. OpenAPI Documentation
11. Configuration (environment variables)
12. Key Differences from the other backends (notably `features.captures = "single"` — Python `re`
    cannot report every capture of a repeated group)
13. Deployment

### 4. `CLAUDE.md`

- Add `| **api-python** | Python 3.13 / FastAPI | api-python/ |` to the Projects table.
- Add an `### api-python` command block:
  ```bash
  pip install -r requirements.txt   # Install dependencies
  python -m uvicorn src.main:app --port 5200        # Server at http://localhost:5200
  python -m uvicorn src.main:app --reload --port 5200  # Dev server with reload
  ```
- Add an `### api-python Key Files` section under Architecture.
- Update the Overview to say the Vue.js frontend can switch between **three** backends at runtime.
- Update the **API Contract** section to describe v1: the new `GET /api/capabilities` endpoint, the
  normalized rules (`matches` never null, no null omission, 400 ProblemDetails with `string[]` values,
  unsupported bits ignored, 5s timeout returns 200), and a pointer to
  `docs/design/api-contract.md` and `docs/open-api/regex-tester-api.v1.yaml` as the source of truth.
- Update the **Regex Options** table to include a Python column and the new `Ascii` (131072) flag, and to
  note that 128 is reserved.
- Add `regex-tester-api-python.azurewebsites.net` to the Deployment section.
- Add a **Testing** section documenting `tests/contract/`.
- Verify no `ui-angular` references remain (TASK-01 should have removed them).

### 5. `docs/design/ui-vuejs.md`

- Add the Python engine to the engine list and the engine-switching description.
- Document the new capability-driven option rendering and the bundled-config fallback.
- Add `VITE_API_PYTHON` to the environment variable table.

### 6. `docs/design/api-dotnet.md` and `docs/design/api-nodejs.md`

Update both for the TASK-04 / TASK-05 changes: the new `/api/capabilities` endpoint, the updated
`/api/version` shape, `matches: []` on error, the ProblemDetails body, and the 200-instead-of-408 timeout.

### 7. Mark the plan and tasks complete

- Set **Status** to `Implemented` in `docs/plan/2026-07-25-api-contract-and-python-backend.md`.
- Set **Status** to `Done` in each `docs/tasks/TASK-0*.md`.

## Out of scope

- Do not create the Azure resource itself — the workflow assumes `regex-tester-api-python` exists and that
  `AZURE_CREDENTIALS` is configured.
- Do not modify backend or frontend source code; all functional work is done in TASK-01 to TASK-07.
  If you find a functional bug, report it rather than fixing it here.

## Acceptance criteria

- [ ] `.github/workflows/deploy-api-python.yml` exists and is valid YAML
      (`npx --yes yaml-lint` or `python -c "import yaml,sys;yaml.safe_load(open(...))"`).
- [ ] Its `paths` filter, `azure/login@v2`, `azure/webapps-deploy@v3`, and `AZURE_CREDENTIALS` secret usage
      match the conventions in `deploy-api-nodejs.yml`.
- [ ] `.github/workflows/contract-tests.yml` exists, is valid YAML, and covers all three backends.
- [ ] `.github/workflows/` contains exactly five workflow files.
- [ ] `docs/design/api-python.md` exists with all thirteen sections in the order listed.
- [ ] `CLAUDE.md` Projects table lists exactly four projects: api-dotnet, api-nodejs, api-python, ui-vuejs.
- [ ] `CLAUDE.md` documents `GET /api/capabilities` and links to `docs/design/api-contract.md`.
- [ ] `CLAUDE.md` Regex Options table includes a Python column, the `Ascii` (131072) row, and a note that
      128 is reserved.
- [ ] `git grep -in angular` returns nothing.
- [ ] Every markdown link in `CLAUDE.md` and `docs/**/*.md` resolves to a file that exists.
- [ ] The plan file and all eight task files have updated Status fields.

## Report back

The file list, the deployment packaging approach chosen for Azure, and any functional bug you found but
did not fix.
