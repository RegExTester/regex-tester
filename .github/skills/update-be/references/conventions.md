# Contract conventions — rules that must not be broken

Each rule below is enforced by the conformance suite, or exists because a real bug was found here.

## Response shape

- **Every field is always emitted.** No null-omission. `matches` is `[]`, never `null` — including on error.
- Match objects always carry `{ name, index, length, value, groups[], captures[] }`.
- An empty or `null` pattern returns `{ "error": null, "replace": null, "matches": [] }`.

## Error semantics — the most commonly broken rule

- **Regex errors return HTTP 200** with the `error` field populated. Not 400, not 500.
- **The 15 s regex timeout returns HTTP 200** with `error` populated.
- **The 5 s HTTP request timeout returns HTTP 200** with `error` populated — **never HTTP 408**.
- An over-length field returns **HTTP 400** with an RFC 9457 `ProblemDetails` body whose `errors` is
  `{ field: string[] }` (array of strings on every engine).
- A raw body larger than `maxRequestBodyBytes` (8192) returns **HTTP 413** with a ProblemDetails body,
  checked **before** the body is parsed and before any `maxLength` validation.

## Limits

`pattern` ≤ 512, `text` ≤ 1024, `replace` ≤ 1024, raw body ≤ 8192 bytes. These are reported in
`GET /api/capabilities` under `limits`; change them there and in the contract together.

## Option flags

- Flags are a **bitwise integer**, portable across engines.
- **Unsupported bits are ignored silently, never rejected.** One bitmask must work on every engine.
- Report per-engine support via `supported: true|false` in the capabilities option registry — never by
  rejecting the request.
- **Bit 128 is permanently reserved** (historically .NET's internal `RegexOptions.Debug`) and must never
  be allocated.
- `ShowCaptures` (32768) is custom and must be **stripped before regex execution** on every engine.
- `engineKey` must come from the **same constant** the capabilities service uses, so telemetry and
  capabilities can never drift.

## Known deliberate divergences

- api-nodejs always applies `g` and `d` internally regardless of the `Global` (4096) / `HasIndices`
  (2048) bits; those bits exist in the registry for display only.
- api-dotnet reports `captures: multi`; the other two report `single`.
- api-python rewrites `(?<name>...)` → `(?P<name>...)` and `$1` → `\1`.

Divergences must be **documented**, not accidental.

## CORS

- **Never return `Access-Control-Allow-Origin: *`.**
- Allow `https://regextester.github.io` plus a configurable allow-list (`AllowCors` array in .NET
  appsettings; `ALLOW_CORS` comma-separated env var in Node and Python).
- Reflect `http(s)://localhost[:port]` **only in development**.
  - api-python gates on `ENVIRONMENT != "production"` and **defaults to `development`** — production
    must set `ENVIRONMENT=production` or localhost stays allowed. **No workflow sets this**; it is an
    App Service app setting applied at provisioning time (DEPLOYMENT.md §3).
  - **Known gap:** api-nodejs currently reflects localhost in *every* environment. If you touch its CORS,
    fix this to match the other three.

## Telemetry

- One Cosmos database `regex-tester-db`, one container `telemetry`, partitioned on **`/timestamp`**.
  Do not "optimize" this to `/engineKey`: Cosmos cannot change a container's partition key, so any
  change forces operators to delete and recreate the container and lose all history. Treat it as
  effectively immutable. `engineKey` is a plain field, so per-engine queries still work
  (cross-partition).
- **Authentication is Entra ID via `DefaultAzureCredential`. There is no account key anywhere.**
  Config is an endpoint URI (`COSMOS_ENDPOINT`, or `Cosmos:Endpoint` on .NET), which is not a
  secret. Never reintroduce a connection string: a rotated key silently disabled telemetry on all
  four backends for five weeks in 2026-07.
- **Backends never create the database or container.** The Cosmos DB Built-in Data Contributor
  data-plane role grants `readMetadata` and item/container *data* actions only — creating either is
  a control-plane operation, so `CreateContainerIfNotExists` and friends fail with HTTP 403 under an
  Entra token. Resolve a handle and do one metadata read to validate access at startup. The
  container is provisioned out of band (DEPLOYMENT.md §2).
- **api-dotnet passes the partition key value explicitly** (`new PartitionKey(item.timestamp)`). It must
  always match the container path. A mismatch fails every write with `PartitionKeyMismatch` — and because
  telemetry swallows all errors, it fails completely silently.
- Standardized 12-field document, identical camelCase on all four: `id`, `engineKey`, `timestamp`,
  `host`, `userAgent`, `pattern`, `text`, `replace`, `options` (integer), `durationMs`, `matchCount`, `error`.
- **Strictly fire-and-forget writes.** Never awaited on the request path; every error swallowed. .NET uses
  `Task.Run` with `CancellationToken.None`, Node leaves the promise unawaited with `.catch()`, Python uses
  FastAPI `BackgroundTasks`, Java queues onto a single daemon `ExecutorService` thread. api-dotnet used to
  await it, so a Cosmos outage returned HTTP 500 to users — do not regress this.
- **Initialization is the opposite: synchronous, on the startup path, bounded at 10 s.** The first
  request after every restart must be recorded. Enforce the bound *outside* the SDK — .NET's
  `CancellationToken` (~37 s), Node's `abortSignal` (ignored) and Python's timeout kwargs (~12 s)
  were all measured overshooting a 10 s budget against a blackholed address.
- An empty endpoint setting disables telemetry silently. A bad or unreachable one, a missing role
  assignment or an unavailable credential is caught at init so **no backend ever fails to start**.
- Do not collect client IPs. `host` is the Host header.
- Do not collect client IPs. `host` is the Host header.

## Frontend: carried bits

`ui-vuejs` renders only options the selected engine supports. Bits set in the URL that the current engine
does not expose **must be preserved**, or switching engines silently corrupts a shared link.

`computeCarriedBits(bitmask, renderedOptions)` returns `bitmask & ~exposedMask` and is recomputed (never
accumulated) at the end of both `rebuildOptions()` and `rebuildOptionsFromCapabilities()`.
`currentBitmask()` = rendered checked sum `|` carried bits, used for both the POST body and the router URL.

Verify by round-tripping a bit that one engine lacks: set it on the engine that supports it, switch away,
switch back, confirm it survives in the URL.

## Verification bar

A change is done when:

- The conformance suite passes against **all four** backends
- The new behaviour has a **new conformance test**
- Docs that describe the changed behaviour are updated in the same commit
