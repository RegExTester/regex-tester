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

# App Service plan (Linux, shared by all four backends)
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

az webapp create --name regex-tester-api-java --resource-group regex-tester \
  --plan regex-tester-plan --runtime "JAVA:21-java21"
```

> **App name vs. default hostname.** These are no longer the same string. Azure now assigns each new
> web app a **unique default hostname** of the form
> `<app-name>-<random>.<region>-01.azurewebsites.net`, so `regex-tester-api-python` is reachable at
> `regex-tester-api-python-c9apa4ekfta6hac6.centralus-01.azurewebsites.net` and
> `regex-tester-api-java` at `regex-tester-api-java-addef8dcgjbqa6bc.centralus-01.azurewebsites.net`.
> The two older apps (`-dotnet`, `-nodejs`) predate this and still use the short
> `<app-name>.azurewebsites.net` form.
>
> The **app name** is what the deploy workflows use (`AZURE_WEBAPP_NAME`), and it is unchanged — do
> not edit the workflows. The **hostname** is what the frontend calls, so it lives in
> `ui-vuejs/.env.production`. The random suffix is assigned at creation time and will differ in your
> subscription, so after creating the apps read the real values back and update
> `ui-vuejs/.env.production` to match:
>
> ```bash
> az webapp show --name regex-tester-api-python --resource-group regex-tester \
>   --query defaultHostName --output tsv
> ```

```bash
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
> unique per document, so writes spread evenly across logical partitions. Cosmos cannot change a
> container's partition key after creation, and `/timestamp` is the key the container has always
> used, so an existing deployment needs **no action**: do not delete or recreate anything.
>
> The only exception is a container that was manually recreated on `/engineKey` while that key was
> briefly specified. If you have one, recreate it on `/timestamp` — note this destroys existing
> telemetry, which is why the key was reverted.

> **This step is mandatory, not a convenience.** The backends no longer create the database or
> container. They authenticate with Entra ID (§3), and the *Cosmos DB Built-in Data Contributor*
> data-plane role deliberately grants no permission to create either — that is a control-plane
> operation. A backend pointed at a container that does not exist logs a warning at startup and
> runs with telemetry disabled.

### Managed identity and Cosmos access

Telemetry authenticates with **Entra ID, not an account key**. There is no connection string and no
secret in any app setting. This is deliberate: a rotated account key silently disabled telemetry
across all four backends for five weeks in 2026-07 (§9).

Enable a system-assigned identity on each web app and grant it the data-plane role:

```bash
for app in regex-tester-api-dotnet regex-tester-api-nodejs \
           regex-tester-api-python regex-tester-api-java; do
  principal=$(az webapp identity assign --name "$app" --resource-group regex-tester \
    --query principalId -o tsv)

  # Cosmos DB Built-in Data Contributor. Data plane only: read metadata, and read/write items.
  # It cannot create databases or containers -- hence the mandatory provisioning in section 2.
  az cosmosdb sql role assignment create --account-name regex-tester-cosmos \
    --resource-group regex-tester --scope "/" --principal-id "$principal" \
    --role-definition-id 00000000-0000-0000-0000-000000000002
done
```

Grant yourself the same role to write telemetry from a local run — `DefaultAzureCredential` falls
back to your `az login` session:

```bash
az cosmosdb sql role assignment create --account-name regex-tester-cosmos \
  --resource-group regex-tester --scope "/" \
  --principal-id "$(az ad signed-in-user show --query id -o tsv)" \
  --role-definition-id 00000000-0000-0000-0000-000000000002
```

> Locally, `DefaultAzureCredential` finds your session by shelling out to `az`, so the Azure CLI must
> be **on `PATH` of the process running the backend**. A backend started from a shell without it
> reports `Azure CLI could not be found` and starts with telemetry disabled.

Role assignments take up to a minute each to propagate. Verify:

```bash
az cosmosdb sql role assignment list --account-name regex-tester-cosmos \
  --resource-group regex-tester -o table
```

## 3. App settings per web app

| App | Setting | Value | Notes |
|---|---|---|---|
| all four | `ALLOW_CORS` / `AllowCors` | *(empty, or extra comma-separated origins)* | `https://regextester.github.io` and `localhost` are always allowed in code; this adds more |
| api-dotnet | `Cosmos__Endpoint` | `https://regex-tester-cosmos.documents.azure.com:443/` | Not a secret. App Service flattens nested config keys with `__` |
| api-dotnet | `Cosmos__Database` | `regex-tester-db` | |
| api-dotnet | `Cosmos__Container` | `telemetry` | |
| api-nodejs | `COSMOS_ENDPOINT` | `https://regex-tester-cosmos.documents.azure.com:443/` | |
| api-nodejs | `COSMOS_DATABASE` | `regex-tester-db` | defaults to this value if unset |
| api-nodejs | `COSMOS_CONTAINER` | `telemetry` | defaults to this value if unset |
| api-nodejs | `PORT` | *(leave unset)* | App Service injects its own `PORT`; code defaults to 5100 only for local dev |
| api-python | `COSMOS_ENDPOINT` | `https://regex-tester-cosmos.documents.azure.com:443/` | |
| api-python | `COSMOS_DATABASE` | `regex-tester-db` | |
| api-python | `COSMOS_CONTAINER` | `telemetry` | |
| api-python | `ENVIRONMENT` | `production` | **required** — see warning below |
| api-java | `COSMOS_ENDPOINT` | `https://regex-tester-cosmos.documents.azure.com:443/` | |
| api-java | `COSMOS_DATABASE` | `regex-tester-db` | defaults to this value if unset |
| api-java | `COSMOS_CONTAINER` | `telemetry` | defaults to this value if unset |
| api-java | `ENVIRONMENT` | `production` | **required** — see warning below |
| api-java | `PORT` | *(leave unset)* | App Service injects its own `PORT`; code defaults to 5300 only for local dev |

> An empty or absent endpoint setting disables telemetry silently, which is the intended
> local-development and CI state. There is deliberately **no** `COSMOS_CONNECTION_STRING` /
> `Cosmos__ConnectionString` setting any more; if you find one on a web app it is a leftover and
> should be deleted.

> **`ENVIRONMENT` warning.** `api-python` and `api-java` both default `ENVIRONMENT` to `development`
> when the setting is absent. In development mode they open CORS to any `http(s)://localhost[:port]`
> origin. If you deploy without setting `ENVIRONMENT=production`, the deployed instance keeps
> reflecting localhost origins in production.
>
> **Nothing in CI sets this for you.** It is a one-time provisioning step you must perform here, and
> re-check whenever the web app is recreated. Verify it with:
>
> ```bash
> az webapp config appsettings list --name regex-tester-api-python \
>   --resource-group regex-tester --query "[?name=='ENVIRONMENT']"
>
> az webapp config appsettings list --name regex-tester-api-java \
>   --resource-group regex-tester --query "[?name=='ENVIRONMENT']"
> ```

Example of setting app settings directly:

```bash
COSMOS_ENDPOINT="https://regex-tester-cosmos.documents.azure.com:443/"

az webapp config appsettings set --name regex-tester-api-dotnet --resource-group regex-tester \
  --settings Cosmos__Endpoint="$COSMOS_ENDPOINT" \
             Cosmos__Database="regex-tester-db" Cosmos__Container="telemetry"

az webapp config appsettings set --name regex-tester-api-python --resource-group regex-tester \
  --settings ENVIRONMENT=production \
             COSMOS_ENDPOINT="$COSMOS_ENDPOINT" \
             COSMOS_DATABASE="regex-tester-db" COSMOS_CONTAINER="telemetry"
```

`api-python`'s startup command is set by the deploy workflow itself via the `startup-command` input
of `azure/webapps-deploy@v3` (see §4), so you do not normally need this — but it is the equivalent
manual command:

```bash
az webapp config set --name regex-tester-api-python --resource-group regex-tester \
  --startup-file "env PYTHONPATH=/home/site/wwwroot/site-packages:/home/site/wwwroot python -m uvicorn src.main:app --host 0.0.0.0 --port \$PORT"
```

The `PYTHONPATH` prefix is required, not cosmetic. `api-python` ships its dependencies vendored in
`site-packages` and runs no Oryx build, so App Service finds neither an `antenv` virtualenv nor an
`__oryx_packages__` directory and starts the app on the bare system interpreter. Without the
explicit path the app dies at boot with `No module named uvicorn`, App Service restarts it, and the
site serves the default placeholder page while the log loops on that one line.

`api-java` needs **no** startup command at all. Its `pom.xml` sets `<finalName>app</finalName>`, so
the deployed artifact is `app.jar` — exactly what App Service's Java SE container runs by default
(`java -jar /home/site/wwwroot/app.jar`). Do not set a startup command for it; if one was set by
mistake, clear it with `az webapp config set --name regex-tester-api-java --resource-group
regex-tester --startup-file ""`.

## 4. Creating deployment credentials

### Currently wired: a service-principal secret (`AZURE_CREDENTIALS`)

**This is what the committed workflows in `.github/workflows/` actually use today.** All four
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
four deploy workflows** — as committed today they use `AZURE_CREDENTIALS`, not `client-id` /
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
| `AZURE_CREDENTIALS` | `deploy-api-dotnet.yml`, `deploy-api-nodejs.yml`, `deploy-api-python.yml`, `deploy-api-java.yml` | Service-principal JSON for `azure/login@v2` | `az ad sp create-for-rbac --sdk-auth` scoped to the `regex-tester` resource group (§4) |
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

`ui-vuejs/.env.production` points the four engine base URLs at the live Azure hosts
(`https://regex-tester-api-*.azurewebsites.net`); it's baked into the build at `npm run build-prod`
time, so no runtime configuration is needed on Pages.

To stand up the target Pages repo yourself: create `RegExTester/regextester.github.io` (or your own
equivalent — update `external_repository` in the workflow if you rename it), then enable Pages on
it (**Settings → Pages → Source: Deploy from a branch → `master` / root**).

## 7. CI

`contract-tests.yml` runs on every push to `main` and on every pull request. It matrix-builds all
four backends, starts each on its real port (5000/5100/5200/5300), polls
`GET /api/capabilities` with `curl` (up to 30 times, 2 s apart) until ready, then runs the
[tests/contract/](tests/contract/) vitest suite against it with `BASE_URL` set accordingly. This is
the gate that proves a change didn't break the shared contract on any engine.

The five deploy workflows are each **path-filtered** to their own project directory plus their own
workflow file (e.g. `deploy-api-python.yml` only triggers on changes under `api-python/**` or to
itself), so editing one backend never redeploys the others, and editing the frontend never
redeploys any backend. Every deploy workflow also supports manual `workflow_dispatch`.

### Deploys are gated on a green test suite

**No deploy runs unless the contract suite passes for the exact commit being deployed.** Every
deploy workflow starts with a `test` job that calls `contract-tests.yml` as a reusable workflow, and
its `build-and-deploy` job declares `needs: test`:

```yaml
jobs:
  test:
    uses: ./.github/workflows/contract-tests.yml

  build-and-deploy:
    needs: test
    ...
```

Consequences worth knowing:

- **All four engines must be green, for every deploy — including the frontend.** The backends
  implement one shared contract and the frontend talks to all four, so a red `api-python` blocks a
  `ui-vuejs` deploy as well. This is intentional.
- **`workflow_dispatch` is gated too.** There is deliberately no `skip_tests` input; a manual deploy
  runs the same suite. If you genuinely must ship past a red suite, fix or quarantine the test in a
  commit — don't add a bypass.
- **The suite runs twice on a deploy push**: once from `contract-tests.yml`'s own `push` trigger
  (which keeps the README status badge meaningful) and once inside the deploy workflow. Accepted
  trade; the wasted minutes are cheaper than shipping untested code.
- **No secrets are passed to the test job.** The suite needs none, and the Azure credentials and
  Pages token must not be exposed to it. Do not add `secrets: inherit`.
- A failed gate leaves the previous deployment untouched — nothing is uploaded to Azure or Pages.

This gate covers workflow-triggered deploys. It does **not** stop someone merging a red commit into
`main` in the first place — for that, enable branch protection on `main` in the repository settings
with *Contract tests* as a required status check. The two are complements, not substitutes.

## 8. Verification after deploy

```bash
# Each backend: capabilities should report the right engine and a runtime block
curl -s https://regex-tester-api-dotnet.azurewebsites.net/api/capabilities | grep -o '"engineKey":"[A-Z]*"'
curl -s https://regex-tester-api-nodejs.azurewebsites.net/api/capabilities | grep -o '"engineKey":"[A-Z]*"'
curl -s https://regex-tester-api-python-c9apa4ekfta6hac6.centralus-01.azurewebsites.net/api/capabilities | grep -o '"engineKey":"[A-Z]*"'
curl -s https://regex-tester-api-java-addef8dcgjbqa6bc.centralus-01.azurewebsites.net/api/capabilities | grep -o '"engineKey":"[A-Z]*"'

# Each backend: a simple match should come back populated
curl -s -X POST https://regex-tester-api-python-c9apa4ekfta6hac6.centralus-01.azurewebsites.net/api/regex \
  -H "Content-Type: application/json" \
  -d '{"pattern":"a+","text":"aaa","options":0}'

# Each backend: GET / should redirect to the frontend
curl -sI https://regex-tester-api-dotnet.azurewebsites.net/ | grep -i location
```

Then open `https://regextester.github.io/`, switch the engine dropdown between all four backends,
and confirm each returns matches without a CORS error in the browser console.

## 9. Rollback and troubleshooting

- **Rollback**: redeploy the previous commit's workflow run via `workflow_dispatch` on that ref, or
  use `az webapp deployment list-publishing-profiles` / the Azure Portal's deployment slots/history
  to redeploy a prior package. This repo does not currently use deployment slots.
- **CORS failures**: confirm `ALLOW_CORS` / `AllowCors` on the backend includes the calling origin,
  and for api-python and api-java confirm `ENVIRONMENT=production` is actually set (otherwise it's
  not a CORS bug, it's overly-permissive dev CORS silently active).
- **App Service cold starts vs. the 5 s request timeout**: a cold Linux App Service instance can
  take longer than 5 s to serve its first request after idling, which the *client* sees as the
  backend's own "request timed out" body (still HTTP 200) rather than a network error. The frontend
  no longer cancels the warm-up call — `GET /api/capabilities` is issued with no client timeout, so
  the engine indicator waits for a cold instance instead of flipping to `offline` — but that only
  hides the symptom.

  **This deployment runs on `F1` (Free) plans, which do not support Always On at all**, so every app
  unloads after roughly 20 minutes idle and every subsequent visit pays a full cold start. F1 also
  throttles CPU against a daily quota, which hits JVM startup hardest. Replacing Spring Boot with
  Javalin (TASK-30) cut api-java's baseline from 2.31 s to 0.70 s, putting all four engines within
  the same band (measured locally: 0.5 s for .NET, 0.7 s for Java, 0.9 s for Python, 1.1 s for
  Node). Cold starts remain, but no single engine is now the outlier. The options are:

  - Move the plan to **`B1`**, the cheapest tier that supports Always On, and enable it. This
    removes cold starts entirely and is the only complete fix.
  - Stay on F1 and keep the apps warm with an external scheduled ping (for example a
    `schedule:`-triggered GitHub Actions workflow hitting `/api/capabilities` every ~10 minutes).
    Free, and negligible against the CPU quota.

  Do not follow older advice suggesting `Always On` is available here — on F1 the setting cannot be
  turned on.
- **api-python startup command**: if the app returns App Service's default "Application Error"
  page, re-check the startup command with
  `az webapp config show --name regex-tester-api-python --resource-group regex-tester --query linuxFxVersion`
  and re-run the `az webapp config set --startup-file ...` command from §3 — a redeploy through the
  Portal or a manual package push can reset it.
- **api-java "Application Error"**: the Java SE container runs `app.jar` from `/home/site/wwwroot`.
  If the deployed artifact is named anything else (e.g. `regex-tester-api-java-1.0.0.jar`), the
  container has nothing to start. Confirm `<finalName>app</finalName>` is still in `api-java/pom.xml`
  and that `deploy-api-java.yml` uploads `api-java/target/app.jar`.
- **Telemetry silently absent**: an empty or absent `COSMOS_ENDPOINT` / `Cosmos__Endpoint` disables
  telemetry with no error anywhere (by design, so a Cosmos outage or missing config never breaks the
  API). If telemetry documents aren't appearing, check in this order:

  1. The endpoint setting is populated (§3).
  2. The web app has a system-assigned identity and a **Cosmos DB Built-in Data Contributor** role
     assignment (§2). A missing assignment produces HTTP 403 on every write.
  3. The database and container exist with partition key `/timestamp` (§2). The backends no longer
     create them.

  A failed initialization always logs `Cosmos DB telemetry initialization failed; telemetry is
  disabled` at warning level on startup. Reach it with
  `az webapp log tail --name <app> --resource-group regex-tester`.
- **Telemetry silently absent even though the setting is populated — a stale account key.**
  *Historical: this failure mode no longer applies.* Key-based authentication was removed on
  2026-08-30 in favour of managed identity (§2), so there is no key to go stale. Kept here because
  it still applies to any deployment running a build from before that change.

  It happened on 2026-08-30 and went unnoticed for five weeks: the Cosmos account's keys had been
  rotated after the app settings were written, so every backend authenticated with a dead key and
  got HTTP 401 on every call. Nothing surfaced it — `POST /api/regex` kept returning HTTP 200,
  because telemetry swallows all errors by design.

  A stale key looks identical to a correct one: same format, same 169-character length. On an older
  build, compare the values rather than their shape:

  ```powershell
  $live = (az cosmosdb keys list --name regex-tester-cosmos --resource-group regex-tester `
      --type connection-strings -o json | ConvertFrom-Json).connectionStrings[0].connectionString
  $stored = (az webapp config appsettings list --name regex-tester-api-nodejs `
      --resource-group regex-tester -o json | ConvertFrom-Json |
      Where-Object { $_.name -eq 'COSMOS_CONNECTION_STRING' }).value
  "match = $($live -eq $stored)"
  ```

  The durable fix is to deploy a build that uses managed identity, not to re-copy the key.

## 10. Cost note

Measured 2026-08-30 — **this deployment currently costs nothing**:

- **App Service**: both plans (`regex-tester-free-plan` and `ASP-regextester-8d56`) are **`F1`
  (Free)**. The trade-off is real: F1 has a daily CPU quota, throttles shared cores, and **cannot
  enable Always On**, so every app cold-starts after ~20 minutes idle (§9).
- **Cosmos DB**: the account has free tier enabled, and the 400 RU/s container sits inside the
  1000 RU/s free allowance with ~28.7 MB stored against a 25 GB allowance.

If you outgrow this:

- App Service: `B1` (Basic) is the cheapest tier that supports Always On, which is the single
  biggest fix for perceived slowness.
- Cosmos DB: stay on provisioned free tier for as long as the workload fits. **Do not** switch the
  container to serverless to "save money" — serverless is not covered by the free-tier allowance, so
  it would start charging for a workload that is currently free.

## See also

- [README.md](README.md) — quick start
- [ARCHITECTURE.md](ARCHITECTURE.md) — system design, telemetry, and cross-cutting concerns
- [docs/design/api-contract.md](docs/design/api-contract.md) — the shared v1 API contract
