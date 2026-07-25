# TASK-04 — Normalize `api-dotnet` to the v1 contract

| | |
|---|---|
| **Phase** | 2a |
| **Depends on** | TASK-02 (canonical contract) |
| **Blocks** | TASK-07, TASK-08 |
| **Runs in parallel with** | TASK-03, TASK-05, TASK-06 |
| **Plan** | [docs/plan/2026-07-25-api-contract-and-python-backend.md](../plan/2026-07-25-api-contract-and-python-backend.md) |
| **Status** | Done |

## Context

`api-dotnet` predates the shared contract and diverges from it in six ways. Bring it into conformance with
`docs/open-api/regex-tester-api.v1.yaml` and `docs/design/api-contract.md` — read both before starting.

**Only modify files under `api-dotnet/` and the regenerated OpenAPI JSON under `docs/open-api/api-dotnet/`.**

## What changes

### 1. Stop omitting null properties

`api-dotnet/Startup.cs` (or wherever JSON options are configured) currently applies
`JsonIgnoreCondition.WhenWritingNull`. Remove it so every contract property is always serialized.
Verify `RegexResult`, `MatchResult`, `GroupResult` in `api-dotnet/Models/RegexResult.cs` carry no
`[JsonIgnore(Condition = ...)]` attributes that would reintroduce omission.

### 2. `matches` must never be null

`api-dotnet/Services/RegExProcessor.cs` — ensure every return path (regex compile error,
`RegexMatchTimeoutException`, no matches, empty pattern) sets `Matches` to an **empty collection**,
never `null`. Update the model so `Matches` is initialized to an empty list by default.

### 3. `/api/version` gains contract fields

`api-dotnet/Controllers/HomeController.cs` — extend the response to:

```jsonc
{
  "engineKey": "DOTNET",
  "engineName": ".Net",
  "contractVersion": "1.0",
  "os": "...",          // RuntimeInformation.OSDescription  (keep)
  "framework": "..."    // RuntimeInformation.FrameworkDescription (keep)
}
```

Keep the existing 24-hour caching. The `debug` property currently emitted in DEBUG builds may stay, but it
must be documented as non-contractual — prefer removing it.

### 4. New endpoint `GET /api/capabilities`

Add to `HomeController` (or a new `CapabilitiesController`). Response:

```jsonc
{
  "engineKey": "DOTNET",
  "engineName": ".Net",
  "contractVersion": "1.0",
  "defaultOptions": 1031,          // IgnoreCase|Multiline|ExplicitCapture|NonBacktracking = 1|2|4|1024
  "limits": {
    "patternMaxLength": 512, "textMaxLength": 1024, "replaceMaxLength": 1024,
    "regexTimeoutMs": 15000, "requestTimeoutMs": 5000
  },
  "features": { "replace": true, "captures": "multi", "namedGroups": true },
  "options": [ /* every flag in the registry */ ]
}
```

- Serve with `Cache-Control: public, max-age=86400`.
- The `options` array must list **every** flag from the registry in `docs/design/api-contract.md`
  (values 1, 2, 4, 8, 16, 32, 64, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072 —
  **skip the reserved 128**), each as
  `{ value, name, flag, supported, description }`. `supported: true` for the ten .NET `RegexOptions`
  plus `ShowCaptures` (32768); `supported: false` for the JS-only and Python-only bits.
  `flag` is `null` for every .NET option.
- `captures` is `"multi"` — .NET is the only engine that retains every capture of a repeated group.
- Derive the list from a single static source (e.g. extend `api-dotnet/Models/RegExTesterOptions.cs` with a
  registry) rather than hard-coding a literal JSON blob in the controller.

### 5. HTTP request timeout returns 200, not 408

`Startup.cs` currently uses `AddRequestTimeouts` with a 5-second default policy, which surfaces as
HTTP 408. Change the policy to write a **HTTP 200** body instead:

```json
{ "error": "The request timed out (exceeded 5 seconds).", "replace": null, "matches": [] }
```

Use the policy's `WriteTimeoutResponse` / `TimeoutStatusCode` hooks, or replace the mechanism with custom
middleware that produces the body directly. The 15-second regex timeout inside `RegExProcessor` is
unchanged and continues to surface through the `error` field.

### 6. Validation errors as RFC 9457 ProblemDetails

Validation currently returns `BadRequest(ModelState)`. Configure `ApiBehaviorOptions.InvalidModelStateResponseFactory`
so the body is exactly:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.1",
  "title": "One or more validation errors occurred.",
  "status": 400,
  "errors": { "pattern": ["..."] }
}
```

Keys must be the camelCase property name (`pattern`, `text`, `replace`), and every value an array of strings.

### 7. `options` defaults to 0

`api-dotnet/Models/Input.cs` — ensure a request body omitting `options` binds to `RegExTesterOptions.None`
(0) rather than failing validation.

### 8. Unsupported bits ignored

Confirm `RegExProcessor` masks the incoming bitmask to the bits .NET understands before constructing
`RegexOptions`, so JS-only bits (2048, 4096, 8192, 16384, 65536) and Python-only 131072 do not throw
`ArgumentOutOfRangeException`. Add the masking if it is missing.

### 9. Regenerate the OpenAPI document

Refresh `docs/open-api/api-dotnet/RegExTester.Api.DotNet.json` from the running API so it reflects the new
endpoint and schemas.

## Out of scope

- Do not change the Base64Url URL-sharing scheme (that is frontend-side anyway).
- Do not touch `api-nodejs/`, `api-python/`, or `ui-vuejs/`.
- Do not remove the Cosmos telemetry service.
- If TASK-01 has already removed the "Angular frontend" wording from the XML comments, leave it alone;
  if it has not, still leave it alone — that is TASK-01's job.

## Acceptance criteria

- [ ] `cd api-dotnet; dotnet build` succeeds with no new warnings.
- [ ] `POST /api/regex` with a valid pattern returns a body where `error`, `replace`, and every
      `captures` field are **present as `null`** rather than omitted.
- [ ] `matches` is `[]` for: invalid pattern `([`, empty pattern, and a pattern that matches nothing.
      It is never `null`.
- [ ] Invalid pattern returns HTTP 200 with `error` non-null.
- [ ] `GET /api/version` returns `engineKey`, `engineName`, `contractVersion`, `os`, `framework`.
- [ ] `GET /api/capabilities` returns 200 with `Cache-Control: public, max-age=86400` and an `options`
      array containing 17 entries (registry minus reserved 128).
- [ ] `features.captures` is `"multi"`.
- [ ] A 513-character `pattern` returns HTTP 400 with `type`, `title`, `status`, and
      `errors.pattern` as an **array of strings**.
- [ ] A request body of `{"pattern":"a","text":"a"}` (no `options`) succeeds.
- [ ] `{"pattern":"a","text":"A","options":4096}` returns HTTP 200 with no error, and `options: 4097`
      behaves like `options: 1`.
- [ ] `ShowCaptures` (32768) still populates `captures` and is not passed to `RegexOptions`.
- [ ] Pattern `(\w)+` with `ShowCaptures` on returns **multiple** captures for the group, proving `multi`.
- [ ] `docs/open-api/api-dotnet/RegExTester.Api.DotNet.json` includes `/api/capabilities` and the new
      `/api/version` schema.
- [ ] No file outside `api-dotnet/` and `docs/open-api/api-dotnet/` is modified.

## Report back

The list of files changed, how the 5s timeout 200-response was implemented, the capabilities registry
source, and the outcome of each acceptance check.
