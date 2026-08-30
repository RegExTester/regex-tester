# TASK-28 — Backends: Cosmos telemetry via managed identity

| | |
|---|---|
| **Phase** | 21 |
| **Depends on** | TASK-26 |
| **Blocks** | TASK-29 |
| **Plan** | [docs/plan/2026-08-30-cosmos-managed-identity.md](../plan/2026-08-30-cosmos-managed-identity.md) |
| **Status** | Done |

## Context

All four backends authenticate to Cosmos with an account key copied into an app setting. A rotation
of that key on 2026-07-26 silently disabled telemetry for five weeks. This task removes the secret:
authentication moves to Entra ID via `DefaultAzureCredential`, and the connection string is replaced
by a plain endpoint URI.

## Decisions

### D1 — `COSMOS_ENDPOINT` replaces `COSMOS_CONNECTION_STRING`

A rename, not a reuse. A half-migrated deployment then fails loudly instead of silently preferring a
stale connection string. `COSMOS_DATABASE` and `COSMOS_CONTAINER` are unchanged, and an empty
endpoint still disables telemetry silently.

api-dotnet's key is `Cosmos:Endpoint` (replacing `Cosmos:ConnectionString`), keeping its existing
`Cosmos:*` configuration section convention.

### D2 — Remove `CreateDatabaseIfNotExists` / `CreateContainerIfNotExists`

**Mandatory.** Cosmos DB Built-in Data Contributor grants only `readMetadata`,
`sqlDatabases/containers/*` and `sqlDatabases/containers/items/*`. Creating a database or container
is a control-plane operation with no corresponding data action, so these calls would fail with HTTP
403 on every startup under an Entra token.

Replace with direct references — `GetDatabase(...).GetContainer(...)`, `database(...).container(...)`,
`get_database_client(...).get_container_client(...)`, `getDatabase(...).getContainer(...)`. All four
are client-side handle construction with no network call.

Consequences to preserve deliberately:

- The container **must** already exist (provisioned per DEPLOYMENT.md §2). This is now a hard
  requirement, not a convenience.
- The partition-key comment block in all four services describes a trap
  (`CreateContainerIfNotExists` silently returning a container with a different partition key) that
  no longer exists in the code. Replace it with a note that `/timestamp` must match the provisioned
  container, and that api-dotnet still passes the value explicitly on write.

### D3 — `DefaultAzureCredential`, not `ManagedIdentityCredential`

`DefaultAzureCredential` uses the managed identity on App Service and falls back to `az login`
locally, so the local path stays testable. A developer without the role assignment gets a 403 that is
caught and logged like any other init failure.

### D4 — Startup gets faster, and the bound stays

Dropping two round trips removes most of the measured initialization cost. The 10 s bound, the
blocking startup init and the fire-and-forget writes from TASK-26 all stay exactly as they are — do
not "simplify" them away because init is now cheaper. An unreachable endpoint or a slow token
acquisition can still hang, and that is what the bound exists for.

### D5 — Java loses its connection-string parser

`buildClient()` hand-parses `AccountEndpoint=…;AccountKey=…`, splitting on the first `=` to survive
base64 padding. With an endpoint URI there is nothing to parse: delete the method and call
`.endpoint(endpoint).credential(credential)` directly.

### D6 — No contract change

No endpoint, schema, status code, limit, option bit, or telemetry document field changes. The
conformance suite must pass unchanged and `docs/open-api/api-*.v1.json` must not move.

## Deliverables

| File | Change |
|---|---|
| `api-nodejs/package.json` | Add `@azure/identity`. |
| `api-python/requirements.txt` | Add `azure-identity`. |
| `api-java/pom.xml` | Add `com.azure:azure-identity`. |
| `api-dotnet/*.csproj` | No change — `Azure.Identity` 1.13.2 is already a dependency. |
| `api-dotnet/Services/TelemetryService.cs` | Construct `CosmosClient(endpoint, new DefaultAzureCredential())`; drop both create calls; rename the constructor parameter. |
| `api-dotnet/Startup.cs` | Read `Cosmos:Endpoint`. |
| `api-dotnet/appsettings.json`, `appsettings.Development.json` | `ConnectionString` → `Endpoint`. |
| `api-nodejs/src/services/telemetryService.js` | `new CosmosClient({ endpoint, aadCredentials })`; drop both create calls. |
| `api-nodejs/src/index.js` | Pass `COSMOS_ENDPOINT`. |
| `api-python/src/services/telemetry_service.py` | `CosmosClient(endpoint, credential=DefaultAzureCredential())`; drop both create calls. |
| `api-python/src/main.py` | Pass `COSMOS_ENDPOINT`. |
| `api-python/.env.example` | Document `COSMOS_ENDPOINT`. |
| `api-java/.../service/TelemetryService.java` | `@Value("${COSMOS_ENDPOINT:}")`; `DefaultAzureCredentialBuilder`; delete `buildClient()`; drop both create calls. |

## Out of scope

- Enabling identities, assigning Cosmos roles, changing app settings, CI/CD (TASK-29).
- Documentation (TASK-29).
- Changing the telemetry document, the container, or the `/timestamp` partition key.
- Changing when telemetry is written, or the TASK-26 startup/bound behaviour.

## Acceptance criteria

- [ ] All four build (`dotnet build` clean, `mvn package` succeeds, `npm install` resolves).
- [ ] With `COSMOS_ENDPOINT` empty, all four start and telemetry is a silent no-op.
- [ ] With a valid endpoint and a signed-in `az` session holding the data role, all four write a
      telemetry document on their **first** request after startup.
- [ ] With a valid endpoint and no credential available, all four still start, log a warning, and
      serve `POST /api/regex` normally.
- [ ] No `CreateDatabaseIfNotExists`/`CreateContainerIfNotExists`/`createIfNotExists` call remains in
      any backend.
- [ ] No backend reads `COSMOS_CONNECTION_STRING` or `Cosmos:ConnectionString` any more.
- [ ] Conformance suite passes against all four.
- [ ] `docs/open-api/api-*.v1.json` are unchanged.
- [ ] Every server started during verification is killed.

## Report back

Per engine: the credential type used, how the container reference is obtained, the measured startup
time versus TASK-26's numbers, and the first-request telemetry result.
