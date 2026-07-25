# TASK-12 — Project documentation: README, ARCHITECTURE, DEPLOYMENT

| | |
|---|---|
| **Phase** | 6 |
| **Depends on** | TASK-11 |
| **Blocks** | — |
| **Plan** | [docs/plan/2026-07-25-api-contract-and-python-backend.md](../plan/2026-07-25-api-contract-and-python-backend.md) |
| **Status** | Done |

## Context

The repository has good *internal* documentation — `docs/design/*.md`, `docs/design/api-contract.md`,
`docs/open-api/`, `CLAUDE.md` — but nothing that orients a newcomer or an operator:

- there is **no root `README.md`** at all, so the GitHub landing page is empty;
- there is **no `ARCHITECTURE.md`** anywhere;
- there is **no `DEPLOYMENT.md`**, and the deployment knowledge is scattered across five workflow files
  and one stale ARM template.

This task adds those three documents (plus per-backend architecture docs) without duplicating what
`docs/design/` already covers.

## Guiding rule: link, do not duplicate

`docs/design/*.md` remain the detailed design references. The new documents are entry points:

- `README.md` — what this is, why it exists, how to run it in five minutes.
- `ARCHITECTURE.md` — how the pieces fit together and *why*.
- `<backend>/ARCHITECTURE.md` — the internal structure of one backend.
- `DEPLOYMENT.md` — how to stand it all up in Azure and GitHub.

Where detail already exists, **link to it**. Do not restate the option flag table, the full API contract,
or per-file design notes. If you find any *contradiction* between an existing doc and reality, fix the
existing doc.

## Deliverables

### 1. `README.md` (repository root)

Short. A visitor should understand the project in under a minute.

- One-paragraph description: a regex tester with match highlighting, group/capture extraction and
  shareable Base64Url URLs, implemented as one frontend against three interchangeable backends that all
  satisfy the same versioned API contract.
- The point of the repo: the same UI can run against .NET, Node.js or Python and get identical results —
  it doubles as a side-by-side comparison of the three regex engines.
- Live links: the frontend at `https://regextester.github.io/` and the three Azure API hosts.
- A project table (project / stack / directory / local port), matching `CLAUDE.md`.
- A "Quick start" section with the exact commands to run each project locally on Windows PowerShell
  **and** on bash/macOS/Linux. The Vite dev server is port **4000**.
- A short "How it works" list (debounced input → Base64Url URL → `POST /api/regex` → highlighted result).
- Links to `ARCHITECTURE.md`, `DEPLOYMENT.md`, `docs/design/api-contract.md`, `docs/open-api/`, and
  `tests/contract/`.
- A licence line referencing the existing `LICENSE` file — check what licence it actually is; do not guess.
- Badges only if they point at workflows that genuinely exist in `.github/workflows/`.

### 2. `ARCHITECTURE.md` (repository root)

The system-level view.

- A component diagram in a ```mermaid fenced block: browser SPA → the three APIs → Cosmos DB, plus the
  GitHub Pages and Azure App Service hosting boundaries.
- A request-flow sequence (also mermaid) for a single regex evaluation, including the 800 ms debounce, the
  Base64Url URL update, the 5 s HTTP timeout and the 15 s regex timeout.
- The contract-first design: why one canonical OpenAPI document plus a language-agnostic conformance
  suite, and how a new backend (e.g. Rust) plugs in. Link to the checklist in
  `docs/design/api-contract.md` rather than repeating it.
- How the frontend discovers engine capabilities at runtime and renders only supported options.
- Cross-cutting concerns, one short subsection each: CORS policy, request/regex timeouts, the 8192-byte
  body limit and HTTP 413, error semantics (regex errors are HTTP 200 with an `error` field), and
  telemetry.
- Known deliberate divergences between engines (e.g. `captures: multi` on .NET vs `single` elsewhere).
- A table of the four projects linking to each one's `ARCHITECTURE.md` / design doc.

### 3. `api-dotnet/ARCHITECTURE.md`, `api-nodejs/ARCHITECTURE.md`, `api-python/ARCHITECTURE.md`

One per backend, same section structure across all three so they can be read side by side:

1. Purpose and tech stack (with versions)
2. Directory layout (annotated tree)
3. Request pipeline / middleware order — this genuinely differs per backend and is worth spelling out
4. Regex engine specifics: flag mapping, and any translation the backend performs (e.g. api-python
   rewrites `(?<name>...)` to `(?P<name>...)` and `$1` to `\1`; api-nodejs always applies `g` and `d`)
5. Timeout implementation (how each achieves the 15 s regex and 5 s request limits)
6. Error handling and the 413/400 paths
7. Telemetry integration
8. OpenAPI generation and where the document is served
9. Local development commands
10. Links to the matching `docs/design/*.md` and to the contract

Do **not** create a `ui-vuejs/ARCHITECTURE.md` — the frontend is covered by the root `ARCHITECTURE.md` and
`docs/design/ui-vuejs.md`. State that explicitly in the root document so the asymmetry is intentional and
obvious.

### 4. `DEPLOYMENT.md` (repository root)

The operator runbook. It must be followable start-to-finish by someone with a fresh Azure subscription
and a fork of this repo. Use real values from this repo (resource group `regex-tester`, region
`centralus`, App Service Plan SKU `S1`, app names `regex-tester-api-dotnet` / `-nodejs` / `-python`,
Pages repo `RegExTester/regextester.github.io`).

Cover, in order:

1. **Prerequisites** — Azure subscription, Azure CLI, GitHub account, permission to create a service
   principal.
2. **Provisioning Azure resources** with concrete `az` commands: resource group, App Service plan, the
   three web apps (correct runtime per app), and the Cosmos DB account, database `regex-tester-db` and
   container `telemetry`.
   - The Cosmos container **must** be created with partition key `/engineKey`.
   - Call out prominently that an existing container partitioned on `/timestamp` cannot be altered in
     place and must be deleted and recreated, and that `CreateContainerIfNotExists` will silently keep the
     old key otherwise.
3. **App settings per web app** — a table of every setting each app needs, including
   `COSMOS_CONNECTION_STRING`, `COSMOS_DATABASE`, `COSMOS_CONTAINER`, `ALLOW_CORS`, and
   `ENVIRONMENT=production` for api-python (explain that the code defaults to `development`, so omitting
   this leaves localhost CORS enabled in production).
   - Show how to set them with `az webapp config appsettings set`.
   - State the startup command api-python needs.
4. **Creating deployment credentials.**
   - Preferred: **OIDC / federated credentials** (`azure/login@v2` with `client-id` / `tenant-id` /
     `subscription-id`), because it avoids a long-lived secret in GitHub. Give the exact
     `az ad app federated-credential create` steps.
   - Also document the currently-wired approach: `az ad sp create-for-rbac --sdk-auth` scoped **to the
     resource group, not the subscription**, producing the JSON stored as `AZURE_CREDENTIALS`.
   - Be explicit that the workflows as committed today use `AZURE_CREDENTIALS`, and that adopting OIDC
     requires editing them — do not describe OIDC as if it already works.
5. **GitHub secrets** — a table of every secret the workflows actually reference, verified against
   `.github/workflows/`: `AZURE_CREDENTIALS`, `AZURE_RESOURCE_GROUP`, `PAGES_DEPLOY_TOKEN`. For each:
   which workflow consumes it, what it is, and how to generate it. Include the exact scopes needed for the
   Pages PAT and where to add secrets in the GitHub UI (Settings → Secrets and variables → Actions).
6. **Frontend deployment to GitHub Pages** — the external-repo publish model
   (`RegExTester/regextester.github.io`, branch `master`), why `404.html` and `.nojekyll` are created,
   how `ui-vuejs/.env.production` points at the three Azure APIs, and how to enable Pages on the target
   repo.
7. **CI** — what `contract-tests.yml` runs and when; note that deploys are path-filtered so touching one
   backend does not redeploy the others.
8. **Verification after deploy** — concrete `curl` checks per backend (`GET /api/capabilities` returns the
   right `engineKey` and a `runtime` block; `POST /api/regex` returns matches; `GET /` redirects) and a
   check that the frontend can reach all three engines.
9. **Rollback** and **troubleshooting** — at minimum: CORS failures, App Service cold starts vs the 5 s
   request timeout, api-python startup command problems, and telemetry silently disabled because the
   connection string is empty.
10. **Cost note** — S1 plan and 400 RU/s Cosmos are not free; mention the cheaper options.

### 5. Reconcile existing docs

- `docs/design/api-nodejs.md` currently claims telemetry is **not implemented** for api-nodejs. It is.
  Fix that, and make sure all three design docs describe the telemetry behaviour delivered by TASK-11.
- Add links to the new documents from `CLAUDE.md` and from `docs/tasks/README.md` where appropriate.
- The ARM template at
  `api-dotnet/Properties/ServiceDependencies/regex-tester-api-dotnet - Web Deploy/profile.arm.json`
  describes only the .NET app. Either reference it from `DEPLOYMENT.md` as historical/partial, or say
  plainly that `DEPLOYMENT.md` supersedes it. Do not silently leave two competing sources of truth.

## Out of scope

- Any source code change to the backends or the frontend.
- Any change to the API contract, the OpenAPI documents, or the conformance suite.
- Actually provisioning Azure resources or running any deployment.
- Rewriting `docs/design/*.md` beyond fixing factual errors and adding cross-links.

## Acceptance criteria

- [ ] `README.md`, `ARCHITECTURE.md` and `DEPLOYMENT.md` exist at the repository root.
- [ ] `api-dotnet/ARCHITECTURE.md`, `api-nodejs/ARCHITECTURE.md` and `api-python/ARCHITECTURE.md` exist and
      share the same 10-section structure.
- [ ] Every relative link in every new document resolves to a file that actually exists — verified, not
      assumed.
- [ ] Every mermaid block parses (no syntax errors) and renders as a diagram.
- [ ] Every secret named in `DEPLOYMENT.md` is actually referenced by a workflow in
      `.github/workflows/`, and every secret referenced by those workflows is documented. No invented
      secrets, no omissions.
- [ ] Every `az` command is syntactically valid and uses this repo's real resource names.
- [ ] The Cosmos section states the `/engineKey` partition key and the one-time container recreation.
- [ ] `DEPLOYMENT.md` does not claim OIDC is already configured in the committed workflows.
- [ ] No document contradicts `docs/design/api-contract.md`, `CLAUDE.md`, or the actual workflow files.
- [ ] Ports are correct throughout: 5000 (.NET), 5100 (Node.js), 5200 (Python), 4000 (Vite).
- [ ] The stale "telemetry not implemented" claim in `docs/design/api-nodejs.md` is corrected.
- [ ] No secret values, connection strings, tokens or subscription IDs are committed — placeholders only.

## Report back

List every file created and modified. Confirm how you verified the links and the mermaid syntax. List the
secrets documented and the workflow that consumes each. Note any contradiction you found between existing
documentation and the actual code, and how you resolved it.
