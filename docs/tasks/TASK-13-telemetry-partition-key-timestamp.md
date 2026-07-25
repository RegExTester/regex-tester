# TASK-13 — Revert the telemetry partition key to `/timestamp`

| | |
|---|---|
| **Phase** | 7 |
| **Depends on** | TASK-11, TASK-12 |
| **Blocks** | — |
| **Plan** | [docs/plan/2026-07-25-telemetry-partition-key-timestamp.md](../plan/2026-07-25-telemetry-partition-key-timestamp.md) |
| **Status** | Done |

## Context

TASK-11 decision D2 changed the Cosmos telemetry container's partition key from `/timestamp` to
`/engineKey`. Cosmos cannot alter an existing container's partition key, and
`CreateContainerIfNotExists` silently returns the existing container instead of failing, so that
change only takes effect if an operator deletes and recreates `telemetry` — destroying all history.

Reverting to `/timestamp` removes that operational step. `engineKey` stays a field on every document,
so nothing about the telemetry payload changes.

## Decisions

### D1 — `/timestamp` everywhere, `engineKey` stays a field

Container partition key path becomes `/timestamp` on all three backends. The 12-field document is
unchanged; `engineKey` remains present and still comes from the capabilities constant.

### D2 — api-dotnet must change **two** lines, not one

api-dotnet is the only backend that passes the partition key value explicitly:

```csharp
await CosmosContainer.CreateItemAsync(item, new PartitionKey(item.engineKey), ...);
```

Changing only the container path leaves this passing the wrong value, and every write then fails with
`PartitionKeyMismatch` (HTTP 400). Telemetry is fire-and-forget and swallows all exceptions, so this
fails **silently** — no user-visible symptom, just no data. Both the container path and the
`PartitionKey(...)` argument must change together.

api-nodejs and api-python let the SDK read the value from the document body, so they need only the
container path changed.

### D3 — Not a contract change

`docs/open-api/regex-tester-api.v1.yaml`, `docs/design/api-contract.md`, the conformance suite and the
frontend are all **out of scope**. Telemetry is not observable through the API.

## Deliverables

### Code

| File | Change |
|---|---|
| `api-dotnet/Services/TelemetryService.cs` | `CreateContainerIfNotExistsAsync(container, "/engineKey")` → `"/timestamp"`; `new PartitionKey(item.engineKey)` → `new PartitionKey(item.timestamp)`. Update the class doc comment if it names the key. |
| `api-nodejs/src/services/telemetryService.js` | `partitionKey: { paths: ['/engineKey'] }` → `['/timestamp']`. |
| `api-python/src/services/telemetry_service.py` | `PartitionKey(path="/engineKey")` → `"/timestamp"`; update the module docstring. |

Add a short comment at each container-creation site explaining *why* `/timestamp` is used, so the next
person does not "optimize" it back to `/engineKey`.

### Documentation

| File | Change |
|---|---|
| `DEPLOYMENT.md` | `az cosmosdb sql container create --partition-key-path /timestamp`. **Delete** the "Partition key warning" block and the delete/recreate snippet. Replace with a short note that `/timestamp` matches pre-existing containers so no recreation is needed, and that a container already recreated on `/engineKey` must be recreated once more. |
| `ARCHITECTURE.md` | Telemetry section: `/engineKey` → `/timestamp`. |
| `api-dotnet/ARCHITECTURE.md`, `api-nodejs/ARCHITECTURE.md`, `api-python/ARCHITECTURE.md` | Section 7 partition key reference. |
| `docs/design/api-dotnet.md`, `docs/design/api-nodejs.md`, `docs/design/api-python.md` | Partition key reference. |
| `docs/tasks/TASK-11-standardize-telemetry.md` | Mark D2 superseded by this task; do **not** rewrite history. |
| `docs/tasks/TASK-12-project-documentation.md` | Update the deliverable text that mandates `/engineKey`. |
| `.github/skills/*/references/conventions.md` | Both copies: adjust the partition-key note. |

## Out of scope

- Any change to the telemetry document shape, field names or dispatch mechanism.
- Any API contract, OpenAPI, conformance-suite or frontend change.
- Making the partition key configurable.

## Acceptance criteria

- [ ] All three backends create the container with partition key `/timestamp`.
- [ ] api-dotnet passes `new PartitionKey(item.timestamp)` — matching the container path.
- [ ] No occurrence of `/engineKey` as a *partition key* remains anywhere (`engineKey` as a document
      field and as a capabilities property must remain untouched).
- [ ] `dotnet build` succeeds with no new warnings.
- [ ] All three backends start with an empty connection string and serve `POST /api/regex`.
- [ ] With a syntactically valid but unreachable Cosmos connection string, all three still return
      HTTP 200 from `POST /api/regex`.
- [ ] The conformance suite passes against all three backends (regression check only — no new test,
      per D3).
- [ ] `DEPLOYMENT.md` no longer instructs anyone to delete and recreate the container as a normal step.
- [ ] Every relative link in every touched document still resolves.

## Report back

List every file changed. Confirm the api-dotnet `PartitionKey(...)` argument was changed alongside the
container path. State how the unreachable-Cosmos check was performed and its result.
