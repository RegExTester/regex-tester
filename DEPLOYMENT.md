# Deployment

Operator runbook: how to stand up RegEx Tester in Azure and GitHub Pages from a fresh Azure
subscription and a fork of this repo. All resource names below are the real ones this repo's
workflows already expect — reuse them exactly unless you also edit the workflow files.

> Supersedes the partial ARM template at
> [api-dotnet/Properties/ServiceDependencies/regex-tester-api-dotnet - Web Deploy/profile.arm.json](api-dotnet/Properties/ServiceDependencies/regex-tester-api-dotnet%20-%20Web%20Deploy/profile.arm.json).
> That file only ever described the .NET app and is kept for historical reference; follow this
> document, not that template.

## 1. Prerequisites

- An Azure subscription, with permission to create resource groups, App Service plans/apps, Cosmos
  DB accounts, and a service principal (or federated credential) scoped to that subscription.
- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) (`az`), logged in
  (`az login`).
- A GitHub account with a fork of this repository, and admin access to it (to add secrets and, for
  the frontend, to create the separate `regextester.github.io` Pages repo — or your own equivalent).

## 2. Provisioning Azure resources

```bash
# Resource group
az group create --name regex-tester --location centralus

# App Service plan (Linux, shared by all three backends)
az appservice plan create \
  --name regex-tester-plan \
  --resource-group regex-tester \
  --location centralus \
  --is-linux \
  --sku S1

# Web apps — one per backend, correct runtime each
az webapp create --name regex-tester-api-dotnet --resource-group regex-tester \
  --plan regex-tester-plan --runtime "DOTNETCORE:10.0"

az webapp create --name regex-tester-api-nodejs --resource-group regex-tester \
  --plan regex-tester-plan --runtime "NODE:22-lts"

az webapp create --name regex-tester-api-python --resource-group regex-tester \
  --plan regex-tester-plan --runtime "PYTHON:3.13"

# Cosmos DB account (serverless-capable API for NoSQL)
az cosmosdb create --name regex-tester-cosmos --resource-group regex-tester \
  --locations regionName=centralus

# Database and container — 400 RU/s, partition key /timestamp
az cosmosdb sql database create --account-name regex-tester-cosmos \
  --resource-group regex-tester --name regex-tester-db

az cosmosdb sql container create --account-name regex-tester-cosmos \
  --resource-group regex-tester --database-name regex-tester-db \
  --name telemetry --partition-key-path /timestamp --throughput 400
```

> **Partition key.** The telemetry container is partitioned on `/timestamp`, which is effectively
> unique per document, so writes spread evenly across logical partitions. All three backends call
> `CreateContainerIfNotExists` at startup, which **silently returns an existing container as-is** —
> Cosmos cannot change a container's partition key after creation. `/timestamp` is deliberately the
> same key the container has always used, so an existing deployment needs **no action**: do not
> delete or recreate anything.
>
> The only exception is a container that was manually recreated on `/engineKey` while that key was
> briefly specified. If you have one, recreate it on `/timestamp` — note this destroys existing
> telemetry, which is why the key was reverted.

Retrieve the connection string for the app settings step below:

```bash
az cosmosdb keys list --name regex-tester-cosmos --resource-group regex-tester \
  --type connection-strings
```

## 3. App settings per web app

| App | Setting | Value | Notes |
|---|---|---|---|
| all three | `ALLOW_CORS` / `AllowCors` | *(empty, or extra comma-separated origins)* | `https://regextester.github.io` and `localhost` are always allowed in code; this adds more |
| api-dotnet | `Cosmos__ConnectionString` | `<your-cosmos-connection-string>` | App Service flattens nested config keys with `__` |
| api-dotnet | `Cosmos__Database` | `regex-tester-db` | |
| api-dotnet | `Cosmos__Container` | `telemetry` | |
| api-nodejs | `COSMOS_CONNECTION_STRING` | `<your-cosmos-connection-string>` | |
| api-nodejs | `COSMOS_DATABASE` | `regex-tester-db` | defaults to this value if unset |
| api-nodejs | `COSMOS_CONTAINER` | `telemetry` | defaults to this value if unset |
| api-nodejs | `PORT` | *(leave unset)* | App Service injects its own `PORT`; code defaults to 5100 only for local dev |
| api-python | `COSMOS_CONNECTION_STRING` | `<your-cosmos-connection-string>` | |
| api-python | `COSMOS_DATABASE` | `regex-tester-db` | |
| api-python | `COSMOS_CONTAINER` | `telemetry` | |
| api-python | `ENVIRONMENT` | `production` | **required** — see warning below |

> **`ENVIRONMENT` warning.** `api-python` defaults `ENVIRONMENT` to `development` when the setting
> is absent. In development mode it opens CORS to any `http(s)://localhost[:port]` origin. If you
> deploy without setting `ENVIRONMENT=production`, the deployed instance keeps reflecting localhost
> origins in production. The `deploy-api-python.yml` workflow sets this automatically after every
> deploy (see §4), but set it manually the first time or if you ever deploy outside that workflow.

Example of setting app settings directly:

```bash
az webapp config appsettings set --name regex-tester-api-dotnet --resource-group regex-tester \
  --settings Cosmos__ConnectionString="<your-cosmos-connection-string>" \
             Cosmos__Database="regex-tester-db" Cosmos__Container="telemetry"

az webapp config appsettings set --name regex-tester-api-python --resource-group regex-tester \
  --settings ENVIRONMENT=production \
             COSMOS_CONNECTION_STRING="<your-cosmos-connection-string>" \
             COSMOS_DATABASE="regex-tester-db" COSMOS_CONTAINER="telemetry"
```

`api-python`'s startup command is set by the deploy workflow itself (see §4), not here:

```bash
az webapp config set --name regex-tester-api-python --resource-group regex-tester \
  --startup-file "python -m uvicorn src.main:app --host 0.0.0.0 --port \$PORT"
```

## 4. Creating deployment credentials

### Currently wired: a service-principal secret (`AZURE_CREDENTIALS`)

**This is what the committed workflows in `.github/workflows/` actually use today.** All three
backend deploy workflows authenticate with `azure/login@v2` and `creds: ${{ secrets.AZURE_CREDENTIALS }}`,
a JSON service-principal secret:

```bash
az ad sp create-for-rbac --name regex-tester-deploy --role Contributor \
  --scopes /subscriptions/<subscription-id>/resourceGroups/regex-tester \
  --sdk-auth
```

Scope it to the **resource group**, not the whole subscription, as shown above. Copy the entire
JSON output into the `AZURE_CREDENTIALS` GitHub secret (see §5). This is a long-lived secret; rotate
it periodically.

### Recommended improvement: OIDC / federated credentials

OIDC avoids storing any long-lived secret in GitHub at all, but **adopting it requires editing the
three deploy workflows** — as committed today they use `AZURE_CREDENTIALS`, not `client-id` /
`tenant-id` / `subscription-id`. Treat the steps below as a migration, not something already in
effect:

```bash
# 1. Create (or reuse) an app registration
az ad app create --display-name regex-tester-deploy-oidc

# 2. Create a federated credential trusting GitHub Actions on this repo's main branch
az ad app federated-credential create --id <app-object-id> --parameters '{
  "name": "regex-tester-main",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:<your-org>/regex-tester:ref:refs/heads/main",
  "audiences": ["api://AzureADTokenExchange"]
}'

# 3. Create a service principal for the app and assign it Contributor on the resource group
az ad sp create --id <app-id>
az role assignment create --assignee <app-id> --role Contributor \
  --scope /subscriptions/<subscription-id>/resourceGroups/regex-tester
```

Then, in each deploy workflow, replace the `creds: ${{ secrets.AZURE_CREDENTIALS }}` input with
`client-id` / `tenant-id` / `subscription-id` inputs (sourced from new, non-secret repo variables or
secrets) and add `permissions: { id-token: write }` to the job — this repo does not currently do
this.

## 5. GitHub secrets

Verified against every workflow in `.github/workflows/` — this is the complete list; no other
secret is referenced anywhere in this repo.

| Secret | Used by | What it is | How to generate |
|---|---|---|---|
| `AZURE_CREDENTIALS` | `deploy-api-dotnet.yml`, `deploy-api-nodejs.yml`, `deploy-api-python.yml` | Service-principal JSON for `azure/login@v2` | `az ad sp create-for-rbac --sdk-auth` scoped to the `regex-tester` resource group (§4) |
| `AZURE_RESOURCE_GROUP` | `deploy-api-python.yml` only | Plain resource group name (`regex-tester`), used by the `azure/CLI@v2` step that sets the startup command and `ENVIRONMENT=production` | Just the literal resource group name — not a secret in the cryptographic sense, but stored as one for consistency |
| `PAGES_DEPLOY_TOKEN` | `deploy-ui-vuejs.yml` only | A GitHub [personal access token](https://github.com/settings/tokens) with `repo` scope on the external `RegExTester/regextester.github.io` repository | Create a fine-grained or classic PAT with write access to that repo's contents |

Add secrets at **Settings → Secrets and variables → Actions → New repository secret** on this
repository (`regex-tester`), not on the Pages target repo.

## 6. Frontend deployment to GitHub Pages

`deploy-ui-vuejs.yml` builds `ui-vuejs` and publishes the `dist/` output to a **separate** external
repository, `RegExTester/regextester.github.io`, on its `master` branch, using
`peaceiris/actions-gh-pages@v4` and `PAGES_DEPLOY_TOKEN`. Two files are added to the build output
before publishing:

- `404.html` — a copy of `index.html`, so any deep link served by GitHub Pages' 404 fallback still
  boots the Vue SPA (`ui-vuejs/public/404.html` implements the spa-github-pages redirect trick,
  encoding `&` as `~and~`).
- `.nojekyll` — an empty marker file so GitHub Pages does not run its Jekyll processing step over
  the built assets.

`ui-vuejs/.env.production` points the three engine base URLs at the live Azure hosts
(`https://regex-tester-api-*.azurewebsites.net`); it's baked into the build at `npm run build-prod`
time, so no runtime configuration is needed on Pages.

To stand up the target Pages repo yourself: create `RegExTester/regextester.github.io` (or your own
equivalent — update `external_repository` in the workflow if you rename it), then enable Pages on
it (**Settings → Pages → Source: Deploy from a branch → `master` / root**).

## 7. CI

`contract-tests.yml` runs on every push to `main` and on every pull request. It matrix-builds all
three backends, starts each on its real port (5000/5100/5200), polls
`GET /api/capabilities` with `curl` (up to 30 times, 2 s apart) until ready, then runs the
[tests/contract/](tests/contract/) vitest suite against it with `BASE_URL` set accordingly. This is
the gate that proves a change didn't break the shared contract on any engine.

The four deploy workflows are each **path-filtered** to their own project directory plus their own
workflow file (e.g. `deploy-api-python.yml` only triggers on changes under `api-python/**` or to
itself), so editing one backend never redeploys the other two, and editing the frontend never
redeploys any backend. Every deploy workflow also supports manual `workflow_dispatch`.

## 8. Verification after deploy

```bash
# Each backend: capabilities should report the right engine and a runtime block
curl -s https://regex-tester-api-dotnet.azurewebsites.net/api/capabilities | grep -o '"engineKey":"[A-Z]*"'
curl -s https://regex-tester-api-nodejs.azurewebsites.net/api/capabilities | grep -o '"engineKey":"[A-Z]*"'
curl -s https://regex-tester-api-python.azurewebsites.net/api/capabilities | grep -o '"engineKey":"[A-Z]*"'

# Each backend: a simple match should come back populated
curl -s -X POST https://regex-tester-api-python.azurewebsites.net/api/regex \
  -H "Content-Type: application/json" \
  -d '{"pattern":"a+","text":"aaa","options":0}'

# Each backend: GET / should redirect to the frontend
curl -sI https://regex-tester-api-dotnet.azurewebsites.net/ | grep -i location
```

Then open `https://regextester.github.io/`, switch the engine dropdown between all three backends,
and confirm each returns matches without a CORS error in the browser console.

## 9. Rollback and troubleshooting

- **Rollback**: redeploy the previous commit's workflow run via `workflow_dispatch` on that ref, or
  use `az webapp deployment list-publishing-profiles` / the Azure Portal's deployment slots/history
  to redeploy a prior package. This repo does not currently use deployment slots.
- **CORS failures**: confirm `ALLOW_CORS` / `AllowCors` on the backend includes the calling origin,
  and for api-python confirm `ENVIRONMENT=production` is actually set (otherwise it's not a CORS
  bug, it's overly-permissive dev CORS silently active).
- **App Service cold starts vs. the 5 s request timeout**: a cold Linux App Service instance can
  take longer than 5 s to serve its first request after idling, which the *client* sees as the
  backend's own "request timed out" body (still HTTP 200) rather than a network error. Consider an
  Always On setting (requires a plan tier that supports it; S1 does) or a warm-up ping if this is
  disruptive.
- **api-python startup command**: if the app returns App Service's default "Application Error"
  page, re-check the startup command with
  `az webapp config show --name regex-tester-api-python --resource-group regex-tester --query linuxFxVersion`
  and re-run the `az webapp config set --startup-file ...` command from §3 — a redeploy through the
  Portal or a manual package push can reset it.
- **Telemetry silently absent**: an empty `COSMOS_CONNECTION_STRING` / `Cosmos__ConnectionString`
  disables telemetry with no error anywhere (by design, so a Cosmos outage or missing config never
  breaks the API). If telemetry documents aren't appearing, first confirm the setting is actually
  populated, then confirm the container's partition key is `/engineKey` (§2).

## 10. Cost note

An `S1` App Service Plan (one plan, hosting all three backends as separate web apps) and a 400 RU/s
Cosmos DB container are **not free tier** — expect a modest but real monthly cost. Cheaper options
for a personal/demo deployment:

- App Service: a `B1` (Basic) plan is cheaper than `S1` but has no Always On on some regions/tiers
  and fewer deployment slots; a `F1` (Free) plan exists but cannot run three separate app instances
  reliably and has a daily compute quota.
- Cosmos DB: switch the container to **serverless** billing (pay-per-request instead of provisioned
  RU/s) if traffic is low and bursty, which suits a demo/portfolio project better than a fixed
  400 RU/s reservation.

## See also

- [README.md](README.md) — quick start
- [ARCHITECTURE.md](ARCHITECTURE.md) — system design, telemetry, and cross-cutting concerns
- [docs/design/api-contract.md](docs/design/api-contract.md) — the shared v1 API contract
