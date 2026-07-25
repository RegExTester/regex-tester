# Plan: Revert telemetry partition key to `/timestamp`

| | |
|---|---|
| **Date** | 2026-07-25 |
| **Status** | Implemented |
| **Goal** | Keep the Cosmos telemetry container partitioned on `/timestamp`, as it was before TASK-11, so no existing deployment has to delete and recreate its container. |

---

## 1. Context (from discovery)

[TASK-11](../tasks/TASK-11-standardize-telemetry.md) standardized telemetry across all three backends
and, as decision D2, changed the container partition key from `/timestamp` to `/engineKey`.

That part of TASK-11 turned out to be the only genuinely breaking piece of the change. Cosmos DB
**cannot alter the partition key of an existing container**, and `CreateContainerIfNotExists`
silently returns the pre-existing container rather than failing, so the new key only takes effect if
an operator manually deletes and recreates `telemetry` — losing all historical data in the process.

Everything else TASK-11 delivered (the standardized 12-field document, the `engineKey` field,
fire-and-forget dispatch, the api-python implementation) is unaffected by this reversal.

### 1.1 Current behaviour per backend

| Backend | Container creation | Explicit partition key on write | `timestamp` value |
|---|---|---|---|
| api-dotnet | `CreateContainerIfNotExistsAsync(container, "/engineKey")` | **Yes** — `new PartitionKey(item.engineKey)` passed to `CreateItemAsync` | `DateTime.UtcNow.ToString("o")` |
| api-nodejs | `containers.createIfNotExists({ partitionKey: { paths: ['/engineKey'] } })` | No — the SDK extracts it from the document body | `new Date().toISOString()` |
| api-python | `create_container_if_not_exists(partition_key=PartitionKey(path="/engineKey"))` | No — the SDK extracts it from the document body | `datetime.now(timezone.utc).strftime(...) + "Z"` |

**api-dotnet is the trap.** It is the only backend that passes the partition key value explicitly. If
the container path is changed to `/timestamp` but the write still passes `item.engineKey`, every
insert fails with a `PartitionKeyMismatch` (HTTP 400). Because telemetry is fire-and-forget and
swallows all errors, this would fail **completely silently** — no failed requests, no user-visible
symptom, just no telemetry. Both lines must change together.

### 1.2 Not a contract change

This is an internal storage detail. `POST /api/regex` and `GET /api/capabilities` are untouched, no
request or response shape changes, and the frontend is unaffected. The canonical contract
(`docs/open-api/regex-tester-api.v1.yaml`, `docs/design/api-contract.md`) needs **no** edit, and the
conformance suite needs no new test — it deliberately does not assert on telemetry, which is
unobservable through the API.

## 2. Decisions

### D1 — Revert the partition key to `/timestamp`

Reverses TASK-11 D2. Rationale: avoiding a destructive, manual, data-losing operational step on an
already-deployed container outweighs the query benefit D2 was chasing.

TASK-11 D2 argued that `/engineKey` makes "all telemetry for one engine" a single-partition query.
That is true, but it was the wrong trade:

- Only **3 distinct values** exist, so writes concentrate into 3 logical partitions, each capped at
  20 GB. `/timestamp` is effectively unique per document and spreads writes perfectly.
- `engineKey` remains a **field on every document**, so per-engine queries still work — they are
  cross-partition, which at this project's volume is irrelevant.
- The container runs at 400 RU/s manual throughput. Query efficiency is not the binding constraint.

### D2 — Keep everything else from TASK-11

The 12-field document, camelCase field names, integer `options`, the `engineKey` field sourced from
the capabilities constant, fire-and-forget dispatch, and silent-disable-on-empty-connection-string all
stay exactly as they are. Only the partition key path — and api-dotnet's explicit partition key
value — change.

### D3 — Rejected: make the partition key configurable

Adding a `COSMOS_PARTITION_KEY` setting would let each deployment choose. Rejected: it adds a
configuration axis with no real use case, and a wrong value produces the same silent failure mode as
above. One hard-coded, documented value is safer.

## 3. Breaking-change assessment

**Not breaking.** This restores the pre-TASK-11 behaviour.

- An existing `telemetry` container partitioned on `/timestamp` (any deployment predating TASK-11)
  keeps working with no operator action — which is the entire point.
- A container already recreated on `/engineKey` *would* need recreating again. TASK-11 has not been
  deployed, so in practice no such container exists. `DEPLOYMENT.md` must state this plainly rather
  than assume it.
- No API, frontend or data-shape change.

## 4. Task breakdown

One task — the change is small, tightly coupled and must land atomically. Splitting the code and doc
changes would leave `DEPLOYMENT.md` instructing operators to build a container the code no longer uses.

| Task | Scope |
|---|---|
| [TASK-13](../tasks/TASK-13-telemetry-partition-key-timestamp.md) | Revert the partition key to `/timestamp` in all three telemetry services and reconcile every document that names it. |
