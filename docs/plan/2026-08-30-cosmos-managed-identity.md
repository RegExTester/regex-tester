# Plan: Cosmos telemetry via managed identity

| | |
|---|---|
| **Date** | 2026-08-30 |
| **Status** | Proposed |
| **Goal** | Remove Cosmos DB account keys from every backend and every app setting, authenticating telemetry with Entra ID (`DefaultAzureCredential`) against a system-assigned managed identity instead. |

## Context

On 2026-08-30, telemetry was found to have been silently broken since 2026-07-26. The cause was a
Cosmos DB account key that had been rotated after the App Service settings were written: all four
backends authenticated with a dead key, got HTTP 401 on every call, and swallowed the error. It went
unnoticed for five weeks.

That was fixed by re-applying the current key, and a follow-up change made initialization synchronous
so failures at least surface in the startup log. Neither addresses the root cause: **a long-lived
shared secret copied into four app settings is a failure waiting to recur.** Rotate the key again —
for any reason, including a routine security practice — and telemetry breaks again, silently, in
exactly the same way.

Managed identity removes the secret entirely. There is nothing to rotate, nothing to copy, and
nothing to go stale.

### Current state

| | |
|---|---|
| Auth | `AccountEndpoint=…;AccountKey=…` connection string in one app setting per web app |
| Managed identity | **None** on any of the four web apps |
| Cosmos data-plane role assignments | **None** |
| Startup | Each backend calls `CreateDatabaseIfNotExists` + `CreateContainerIfNotExists`, then writes items |
| `Azure.Identity` | Already a dependency of **api-dotnet** (1.13.2); absent from the other three |

## Decisions

### D1 — System-assigned managed identity, one per web app

Each of the four apps gets its own system-assigned identity, granted the **Cosmos DB Built-in Data
Contributor** data-plane role (`00000000-0000-0000-0000-000000000002`) at account scope.

*Rejected: one user-assigned identity shared by all four.* Fewer role assignments, but it couples the
apps together and loses per-engine attribution in the Cosmos audit trail. Four assignments is a
one-off cost.

*Rejected: keeping keys but storing them in Key Vault.* It moves the secret rather than removing it,
and still breaks on rotation unless a reference is refreshed. Managed identity is strictly better and
no harder here.

### D2 — Drop `CreateDatabaseIfNotExists` / `CreateContainerIfNotExists` — they cannot work

This is forced, not optional. Per the
[data-plane security reference](https://learn.microsoft.com/en-us/azure/cosmos-db/nosql/security/reference-data-plane-actions),
Cosmos DB Built-in Data Contributor grants exactly three actions:

- `Microsoft.DocumentDB/databaseAccounts/readMetadata`
- `Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers/*`
- `Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers/items/*`

There is **no data action for creating a database or a container** — that is a control-plane (ARM)
operation. Keeping the create calls under an Entra token would fail every startup with HTTP 403.

Removing them is an improvement regardless:

- **Two fewer network round trips at startup**, which directly helps the startup cost that the
  synchronous-initialization work just made blocking.
- **The partition-key footgun disappears.** `CreateContainerIfNotExists` silently returns an existing
  container and ignores a mismatched partition-key path — a trap called out in `conventions.md` and
  four architecture documents. Code that never creates a container cannot fall into it.
- Auto-creation was masking configuration errors: a typo in the database name silently produced a
  second, empty database instead of failing.

The database and container are already provisioned explicitly in
[DEPLOYMENT.md](../../DEPLOYMENT.md) §2. That becomes the only way they are created — a required
step rather than a convenience.

*Rejected: granting the identities control-plane `DocumentDB Account Contributor` so the create calls
keep working.* It hands a telemetry writer the power to delete databases, to preserve a call we
actively want gone.

### D3 — `COSMOS_ENDPOINT` replaces `COSMOS_CONNECTION_STRING`

The endpoint URI (`https://regex-tester-cosmos.documents.azure.com:443/`) is not a secret. Renaming
the setting is deliberate: a rename makes a half-migrated deployment fail loudly and immediately,
whereas reusing the old name would let a stale connection string linger and silently take precedence.

Telemetry stays disabled when the setting is empty, exactly as before.

api-java gains a simplification: `buildClient()` currently hand-parses `AccountEndpoint=…;AccountKey=…`
because the Java SDK has no connection-string factory. With an endpoint URI there is nothing to parse,
so that method and its base64-padding edge case are deleted.

### D4 — `DefaultAzureCredential` on all four, so local development still works

`DefaultAzureCredential` resolves a managed identity on App Service and falls back to the developer's
`az login` session locally. A developer who has been granted the data role can therefore write real
telemetry locally with no secret on their machine; one who has not gets a 403, which is caught and
logged exactly like any other initialization failure, leaving telemetry disabled.

*Rejected: `ManagedIdentityCredential`.* Marginally faster to resolve, but it makes local development
impossible and would leave the local path untestable.

### D5 — No API contract change

Telemetry is entirely internal. No endpoint, schema, status code, limit or option bit changes, and
the 12-field document is untouched. The conformance suite must pass unchanged.

## Breaking-change assessment

**Breaking for deployment, not for clients.** Deploying this code without first enabling the
identities, assigning the role, and swapping the app setting leaves telemetry disabled — logged at
warning level, with every endpoint still fully functional. Ordering therefore matters:

1. Enable identities + assign roles + set `COSMOS_ENDPOINT` (safe to do before the code ships; the
   old code ignores the new setting)
2. Deploy the code
3. Remove `COSMOS_CONNECTION_STRING`

The container must already exist. It does.

## Documentation corrections in scope

Investigating hosting cost for this work surfaced two factual errors in [DEPLOYMENT.md](../../DEPLOYMENT.md):

- §10 states the deployment uses "An `S1` App Service Plan" and that it and Cosmos are "**not free
  tier**". Both plans are actually **F1 (Free)**, and the Cosmos account has `enableFreeTier=true`
  with a 400 RU/s container against a 1000 RU/s free allowance — so Cosmos currently costs **$0**.
  The advice to "switch the container to serverless" would move it *off* free tier and start
  charging.
- §9's cold-start entry recommends enabling **Always On**, "requires a plan tier that supports it;
  `S1` does". F1 does not support Always On at all, so the recommended fix cannot be applied to this
  deployment as described.

## Task breakdown

| Task | Scope |
|---|---|
| TASK-28 | All four backends: `DefaultAzureCredential`, `COSMOS_ENDPOINT`, remove create-if-not-exists |
| TASK-29 | Azure provisioning (identities, role assignments, app settings) and documentation, including the cost/Always On corrections |
