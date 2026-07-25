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
    must set `ENVIRONMENT=production` or localhost stays allowed.
  - **Known gap:** api-nodejs currently reflects localhost in *every* environment. If you touch its CORS,
    fix this to match the other two.

## Telemetry

- One Cosmos database `regex-tester-db`, one container `telemetry`.
- Standardized 12-field document, identical camelCase on all three: `id`, `engineKey`, `timestamp`,
  `host`, `userAgent`, `pattern`, `text`, `replace`, `options` (integer), `durationMs`, `matchCount`, `error`.
- **Strictly fire-and-forget.** Never awaited on the request path; every error swallowed. .NET uses
  `Task.Run` with `CancellationToken.None`, Node leaves the promise unawaited with `.catch()`, Python uses
  FastAPI `BackgroundTasks`. api-dotnet used to await it, so a Cosmos outage returned HTTP 500 to users —
  do not regress this.
- An empty connection string disables telemetry silently. A bad or unreachable one is caught at init so
  **no backend ever fails to start**.
- Do not collect client IPs. `host` is the Host header.
- `CreateContainerIfNotExists` **silently returns an existing container and does not change its partition
  key** — changing the partition key requires deleting and recreating the container, which is a breaking
  operational change. Treat any partition-key change as breaking.

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

- The conformance suite passes against **all three** backends
- The new behaviour has a **new conformance test**
- Docs that describe the changed behaviour are updated in the same commit
