# TASK-02 — Define the canonical v1 API contract

| | |
|---|---|
| **Phase** | 0 |
| **Depends on** | Nothing |
| **Blocks** | TASK-03, TASK-04, TASK-05, TASK-06, TASK-07 |
| **Plan** | [docs/plan/2026-07-25-api-contract-and-python-backend.md](../plan/2026-07-25-api-contract-and-python-backend.md) |
| **Status** | Done |

## Context

`api-dotnet` and `api-nodejs` implement the same endpoints but have drifted (different `/api/version`
shapes, different null-serialization policies, different validation error bodies). A third backend
(Python) is being added and a fourth (Rust) is anticipated. This task produces the **single
engine-agnostic source of truth** that every backend must conform to.

**This task writes specification artifacts only. Do not modify any backend or frontend source code.**

## What changes

### 1. New file: `docs/open-api/regex-tester-api.v1.yaml`

An OpenAPI **3.1.1** document describing the contract below. It must be engine-agnostic — no mention of
.NET, Node.js, or Python in paths or schemas (example values may mention engines).

**Paths**

| Path | Method | Responses |
|---|---|---|
| `/` | GET | `302` with `Location: https://regextester.github.io/` |
| `/api/version` | GET | `200` → `VersionResult` |
| `/api/capabilities` | GET | `200` → `Capabilities`, `Cache-Control: public, max-age=86400` |
| `/api/regex` | POST | `200` → `RegexResult`, `400` → `ProblemDetails` |

`/openapi/v1.json` and `/scalar/v1` are required of every backend but are documentation endpoints —
mention them in `docs/design/api-contract.md`, not as paths in the spec.

**Schemas** — all property names are camelCase.

`Input` (request body of `POST /api/regex`)

| Property | Type | Constraints |
|---|---|---|
| `pattern` | `["string","null"]` | `maxLength: 512` |
| `text` | `["string","null"]` | `maxLength: 1024` |
| `replace` | `["string","null"]` | `maxLength: 1024` |
| `options` | `integer` (int32) | default `0` |

No property is required; a missing property is equivalent to `null` (or `0` for `options`).

`RegexResult`

| Property | Type | Notes |
|---|---|---|
| `error` | `["string","null"]` | required, always present |
| `replace` | `["string","null"]` | required, always present |
| `matches` | `array` of `MatchResult` | required, **never null**, `[]` when there are no matches |

`MatchResult` — `name` (string), `index` (int32), `length` (int32), `value` (string),
`groups` (array of `GroupResult`, never null), `captures` (array of `CaptureResult` or `null`).
All six required.

`GroupResult` — `name` (string), `index` (int32), `length` (int32), `value` (string),
`captures` (array of `CaptureResult` or `null`). All five required.

`CaptureResult` — `index` (int32), `length` (int32), `value` (string). All required.

`VersionResult` — `engineKey` (string, e.g. `DOTNET`), `engineName` (string, e.g. `.Net`),
`contractVersion` (string, e.g. `1.0`), `os` (string), `framework` (string).
Document `osDescription` and `frameworkDescription` as **deprecated** optional aliases retained by
api-nodejs for one release.

`Capabilities` — `engineKey`, `engineName`, `contractVersion`, `defaultOptions` (int32),
`limits` (`Limits`), `features` (`Features`), `options` (array of `CapabilityOption`).

`Limits` — `patternMaxLength`, `textMaxLength`, `replaceMaxLength`, `regexTimeoutMs`,
`requestTimeoutMs` (all int32).

`Features` — `replace` (boolean), `namedGroups` (boolean),
`captures` (string enum: `none` | `single` | `multi`).

`CapabilityOption` — `value` (int32), `name` (string), `flag` (`["string","null"]`),
`supported` (boolean), `description` (string).

`ProblemDetails` — RFC 9457: `type` (string), `title` (string), `status` (integer),
`errors` (object with `additionalProperties: { type: array, items: { type: string } }`).

Include at least one realistic `example` for every response schema.

### 2. New file: `docs/design/api-contract.md`

A narrative companion to the YAML. Required sections:

1. **Purpose and versioning** — `contractVersion` `1.0` is reported by `/api/version` and
   `/api/capabilities`; breaking changes bump the major version; versioned URL paths are deferred.
2. **Endpoints** — one subsection per endpoint with a request/response example.
3. **Option flag registry** — the full table below. State that **128 is permanently reserved**
   (.NET internal Debug) and must never be allocated, and that new flags take the next free power of two.

   | Value | Name | .NET | Node.js | Python (`re`) |
   |---|---|---|---|---|
   | 1 | IgnoreCase | `IgnoreCase` | `i` | `IGNORECASE` |
   | 2 | Multiline | `Multiline` | `m` | `MULTILINE` |
   | 4 | ExplicitCapture | `ExplicitCapture` | — | — |
   | 8 | Compiled | `Compiled` | — | — |
   | 16 | Singleline | `Singleline` | `s` | `DOTALL` |
   | 32 | IgnorePatternWhitespace | `IgnorePatternWhitespace` | strip comments | `VERBOSE` |
   | 64 | RightToLeft | `RightToLeft` | — | — |
   | 128 | *reserved* | .NET internal Debug | — | — |
   | 256 | ECMAScript | `ECMAScript` | — | — |
   | 512 | CultureInvariant | `CultureInvariant` | — | — |
   | 1024 | NonBacktracking | `NonBacktracking` | — | — |
   | 2048 | HasIndices | — | `d` | — |
   | 4096 | Global | — | `g` | — |
   | 8192 | Unicode | — | `u` | — |
   | 16384 | UnicodeSets | — | `v` | — |
   | 32768 | ShowCaptures | custom, stripped | custom, stripped | custom, stripped |
   | 65536 | Sticky | — | `y` | — |
   | 131072 | Ascii | — | — | `ASCII` |

4. **Behavioural rules** — the normalization rules, stated as MUSTs:
   - All response fields MUST always be emitted; backends MUST NOT omit null properties.
   - `matches` MUST be `[]` and never `null`, including on error, timeout, and no-match.
   - `captures` MUST be `null` unless `ShowCaptures` (32768) is set.
   - Regex compile errors and the 15s regex timeout MUST return HTTP 200 with `error` populated.
   - Validation failures MUST return HTTP 400 ProblemDetails with `errors: { field: string[] }`.
   - The 5s HTTP request timeout MUST return HTTP 200 with
     `{ error: "…timed out…", replace: null, matches: [] }` — **not** HTTP 408.
   - Unsupported option bits MUST be ignored silently and MUST NOT produce an error, so a bitmask stays
     portable across engines and shared URLs survive an engine switch.
   - `ShowCaptures` MUST be stripped from the bitmask before it reaches the regex engine.
   - CORS MUST allow `https://regextester.github.io` plus any origin listed in the backend's
     `ALLOW_CORS` configuration, and localhost origins in development.
5. **Limits** — pattern 512, text 1024, replace 1024, regex timeout 15000 ms, request timeout 5000 ms.
6. **Adding a new backend (e.g. Rust) — checklist**, covering: implement the four endpoints; report a new
   `engineKey`/`engineName`; serve `/openapi/v1.json` matching the canonical document; declare supported
   flags via `/api/capabilities`; pass the conformance suite (`tests/contract/`, TASK-06); add an
   `ui-vuejs` engine entry and `VITE_API_*` env var; add a deploy workflow; add a design doc.
7. **Known engine divergences** — a table of behaviour that legitimately differs (e.g. `features.captures`
   is `multi` on .NET, `single` on Node.js and Python, because only .NET's engine retains every capture
   of a repeated group).

## Out of scope

- Do not modify `api-dotnet/`, `api-nodejs/`, or `ui-vuejs/`.
- Do not create `tests/contract/` (TASK-06).
- Do not create `api-python/` (TASK-03).

## Acceptance criteria

- [ ] `docs/open-api/regex-tester-api.v1.yaml` exists and declares `openapi: 3.1.1`.
- [ ] The document parses and validates:
      `npx --yes @redocly/cli@latest lint docs/open-api/regex-tester-api.v1.yaml` reports no errors.
- [ ] All nine schemas are present: `Input`, `RegexResult`, `MatchResult`, `GroupResult`, `CaptureResult`,
      `VersionResult`, `Capabilities`, `CapabilityOption`, `ProblemDetails` (plus `Limits`, `Features`).
- [ ] `RegexResult.matches` is **not** nullable in the schema.
- [ ] `MatchResult.captures` and `GroupResult.captures` **are** nullable.
- [ ] Every response schema has an `example`.
- [ ] `docs/design/api-contract.md` exists and contains all seven sections listed above.
- [ ] The flag registry table includes all 18 rows including the reserved 128 entry and the new 131072 Ascii.
- [ ] No file outside `docs/` is modified.

## Report back

The final path list, the redocly lint output, and any place where you had to make a judgement call the
plan did not specify.
