# TASK-05 — Normalize `api-nodejs` to the v1 contract

| | |
|---|---|
| **Phase** | 2b |
| **Depends on** | TASK-02 (canonical contract) |
| **Blocks** | TASK-07, TASK-08 |
| **Runs in parallel with** | TASK-03, TASK-04, TASK-06 |
| **Plan** | [docs/plan/2026-07-25-api-contract-and-python-backend.md](../plan/2026-07-25-api-contract-and-python-backend.md) |
| **Status** | Done |

## Context

`api-nodejs` is close to the v1 contract but diverges in four ways. Bring it into conformance with
`docs/open-api/regex-tester-api.v1.yaml` and `docs/design/api-contract.md` — read both before starting.

**Only modify files under `api-nodejs/`.**

## What changes

### 1. `/api/version` gains contract fields

`api-nodejs/src/controllers/homeController.js` currently returns
`{ osDescription, frameworkDescription }`. Change it to:

```jsonc
{
  "engineKey": "NODEJS",
  "engineName": "Node.js",
  "contractVersion": "1.0",
  "os": "...",                     // same value as osDescription
  "framework": "...",              // same value as frameworkDescription
  "osDescription": "...",          // DEPRECATED alias, retained for one release
  "frameworkDescription": "..."    // DEPRECATED alias, retained for one release
}
```

Keep the existing 24-hour in-memory cache. Mark the two aliases as deprecated in the JSDoc `@openapi`
annotation so the generated spec flags them.

### 2. New endpoint `GET /api/capabilities`

Add a route plus a `src/services/capabilities.js` module. Response:

```jsonc
{
  "engineKey": "NODEJS",
  "engineName": "Node.js",
  "contractVersion": "1.0",
  "defaultOptions": 6147,          // Global|HasIndices|IgnoreCase|Multiline = 4096|2048|1|2
  "limits": {
    "patternMaxLength": 512, "textMaxLength": 1024, "replaceMaxLength": 1024,
    "regexTimeoutMs": 15000, "requestTimeoutMs": 5000
  },
  "features": { "replace": true, "captures": "single", "namedGroups": true },
  "options": [ /* every flag in the registry */ ]
}
```

- Serve with `Cache-Control: public, max-age=86400`.
- The `options` array must list **every** flag from the registry in `docs/design/api-contract.md`
  (values 1, 2, 4, 8, 16, 32, 64, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072 —
  **skip the reserved 128**), each as `{ value, name, flag, supported, description }`.
- `supported: true` for 1, 2, 16, 32, 2048, 4096, 8192, 16384, 32768, 65536.
  `supported: false` for the .NET-only bits (4, 8, 64, 256, 512, 1024) and Python-only 131072.
- `flag` carries the JS inline letter where one exists (`i`, `m`, `s`, `d`, `g`, `u`, `v`, `y`) and `null`
  otherwise.
- `captures` is `"single"` — JavaScript retains only the last capture of a repeated group.
- Define the registry once in `src/services/capabilities.js` and reuse it; do not duplicate literals.

### 3. `matches` must never be null

`api-nodejs/src/services/regexProcessor.js` currently returns `matches: null` on error and timeout, and
`src/middleware/requestTimeout.js` does the same. Change every such path to `matches: []`.

Paths to fix:
- invalid pattern / `SyntaxError` from `new RegExp(...)`
- the 15-second regex deadline expiry
- the 5-second HTTP timeout response in `requestTimeout.js`
- any other early return

### 4. Validation `errors` values become arrays

`api-nodejs/src/controllers/regexController.js` currently builds
`errors.pattern = 'message'` (a bare string). Change every value to an **array of strings**:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.1",
  "title": "One or more validation errors occurred.",
  "status": 400,
  "errors": { "pattern": ["The field pattern must be a string with a maximum length of 512."] }
}
```

### 5. Confirm the remaining rules already hold

Verify (and fix only if broken) that:
- Every response property is emitted, including `null` values — Node already does this.
- Regex errors and the 15s regex timeout return HTTP 200 with `error` populated.
- The 5s HTTP timeout returns HTTP 200 with an error body, not 408.
- Missing `options` defaults to `0`.
- Unsupported option bits (4, 8, 64, 128, 256, 512, 1024, 131072) are ignored silently.
- `ShowCaptures` (32768) is stripped before the flag string is built.

### 6. Update the generated OpenAPI annotations

`api-nodejs/src/schemas.js` and the `@openapi` JSDoc blocks must describe the new
`/api/capabilities` path and the updated `VersionResult` and `ProblemDetails` schemas, and must declare
`RegexResult.matches` as a non-nullable array. Confirm `GET /openapi/v1.json` reflects the changes.

## Out of scope

- Do not touch `api-dotnet/`, `api-python/`, or `ui-vuejs/` — in particular, the
  `ui-vuejs/src/config.nodejs.js` `API.REGEX` bug is TASK-07's responsibility.
- Do not add new runtime dependencies.
- Do not change the CORS policy or port.

## Acceptance criteria

- [ ] `cd api-nodejs; npm ci; npm start` starts cleanly on port 5100.
- [ ] `GET /api/version` returns `engineKey`, `engineName`, `contractVersion`, `os`, `framework`, plus the
      two deprecated aliases.
- [ ] `GET /api/capabilities` returns 200 with `Cache-Control: public, max-age=86400` and an `options`
      array containing 17 entries (registry minus reserved 128).
- [ ] `features.captures` is `"single"`.
- [ ] Invalid pattern `([` returns HTTP 200 with `error` non-null and **`matches: []`**.
- [ ] A pattern that matches nothing returns `matches: []`.
- [ ] A 513-character `pattern` returns HTTP 400 with `errors.pattern` as an **array of strings**.
- [ ] A request body of `{"pattern":"a","text":"a"}` (no `options`) succeeds.
- [ ] `{"pattern":"a","text":"A","options":1024}` returns HTTP 200 with no error, and `options: 1025`
      behaves like `options: 1`.
- [ ] `ShowCaptures` (32768) still populates `captures` and never leaks into the RegExp flag string.
- [ ] `GET /openapi/v1.json` returns 200, includes `/api/capabilities`, and `RegexResult.matches` is
      not nullable.
- [ ] `GET /scalar/v1` still returns 200.
- [ ] No file outside `api-nodejs/` is modified.

## Report back

The list of files changed, where the capability registry lives, and the outcome of each acceptance check.
