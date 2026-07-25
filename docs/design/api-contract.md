# API Contract v1

Narrative companion to the canonical machine-readable spec:
[docs/open-api/regex-tester-api.v1.yaml](../open-api/regex-tester-api.v1.yaml).

Every backend (`api-dotnet`, `api-nodejs`, `api-python`, and any future engine such as `api-rust`)
MUST implement the paths and schemas in that document exactly, and MUST serve it (or an identical
copy) at `GET /openapi/v1.json` with an interactive explorer at `GET /scalar/v1`.

## 1. Purpose and versioning

This contract exists so that adding a new regex engine backend — or a new frontend — is a drop-in
exercise: any client that speaks this contract works against any engine that implements it,
without engine-specific branching.

- `contractVersion` is reported as `"1.0"` by both `GET /api/version` and `GET /api/capabilities`.
- The contract follows semantic-ish versioning at the major.minor level: a **breaking change**
  (removing/renaming a field, changing a type, changing behaviour a client could reasonably depend
  on) bumps the major version (`"2.0"`); additive, backward-compatible changes (a new optional
  field, a new option flag) bump the minor version (`"1.1"`).
- Versioned URL paths (e.g. `/v2/api/regex`) are **deferred** — not needed until a breaking change
  actually ships. Until then, `contractVersion` in the response body is the only version signal.

## 2. Endpoints

### `GET /`

Redirects to the hosted frontend. No response body.

```http
GET / HTTP/1.1
```

```http
HTTP/1.1 302 Found
Location: https://regextester.github.io/
```

### `GET /api/version`

Reports engine identity and runtime version, for diagnostics/support.

```http
GET /api/version HTTP/1.1
```

```json
{
  "engineKey": "NODEJS",
  "engineName": "Node.js",
  "contractVersion": "1.0",
  "os": "linux x64",
  "framework": "Node.js v22.4.0",
  "osDescription": "linux x64",
  "frameworkDescription": "Node.js v22.4.0"
}
```

`osDescription` / `frameworkDescription` are deprecated aliases api-nodejs retains for one release;
new backends MUST NOT emit them.

### `GET /api/capabilities`

Reports the limits, features, and option flags this engine supports, so the frontend can render
option checkboxes dynamically instead of hard-coding a list per engine. Cacheable for 24 hours.

```http
GET /api/capabilities HTTP/1.1
```

```json
{
  "engineKey": "PYTHON",
  "engineName": "Python",
  "contractVersion": "1.0",
  "defaultOptions": 3,
  "limits": {
    "patternMaxLength": 512,
    "textMaxLength": 1024,
    "replaceMaxLength": 1024,
    "maxRequestBodyBytes": 8192,
    "regexTimeoutMs": 15000,
    "requestTimeoutMs": 5000
  },
  "features": { "replace": true, "namedGroups": true, "captures": "single" },
  "options": [
    { "value": 1, "name": "IgnoreCase", "flag": "IGNORECASE", "supported": true, "description": "Case-insensitive matching." },
    { "value": 4, "name": "ExplicitCapture", "flag": null, "supported": false, "description": "Only explicitly named or numbered groups are captured. Not supported by this engine; the bit is ignored." }
  ]
}
```

`options` MUST list **every** flag in the registry (§3), not just the ones this engine supports, so
the frontend can render unsupported flags as disabled rather than omit them.

### `POST /api/regex`

Runs `pattern` against `text` and returns every match with its groups (and captures, if
`ShowCaptures` is set). If `replace` is supplied, also performs a find-and-replace.

```http
POST /api/regex HTTP/1.1
Content-Type: application/json

{ "pattern": "(?<word>\\w+)", "text": "hello world", "replace": null, "options": 0 }
```

```json
{
  "error": null,
  "replace": null,
  "matches": [
    {
      "name": "0", "index": 0, "length": 5, "value": "hello",
      "groups": [
        { "name": "0", "index": 0, "length": 5, "value": "hello", "captures": null },
        { "name": "word", "index": 0, "length": 5, "value": "hello", "captures": null }
      ],
      "captures": null
    }
  ]
}
```

An invalid pattern still returns HTTP 200:

```json
{ "error": "quantifier missing operand", "replace": null, "matches": [] }
```

A request with an over-length field returns HTTP 400:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.1",
  "title": "One or more validation errors occurred.",
  "status": 400,
  "errors": { "pattern": ["The field pattern must be a string with a maximum length of 512."] }
}
```

A request body larger than `maxRequestBodyBytes` (8192) returns HTTP 413, checked *before* the
body is parsed or any field-level `maxLength` is validated:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.11",
  "title": "Request body too large.",
  "status": 413
}
```

### `GET /openapi/v1.json` and `GET /scalar/v1`

Not part of the OpenAPI document itself (a spec cannot describe where to find itself). Every
backend MUST serve the canonical spec as JSON at `/openapi/v1.json` and an interactive explorer
(Scalar) at `/scalar/v1`.

## 3. Option flag registry

`options` is an `int32` bitmask. Flags are additive powers of two; unsupported bits MUST be ignored
silently by every engine (§4). **128 is permanently reserved** (historically the internal Debug bit
of .NET's `RegexOptions`) and MUST NOT be allocated to any future flag. New flags take the next free
power of two after the highest allocated value.

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

A `—` means the engine has no native equivalent for that flag; it is still listed in
`/api/capabilities` with `supported: false` and a `null` `flag`, and setting the bit is a no-op
rather than an error.

## 4. Behavioural rules

These MUST rules are the normalization contract every backend has to follow, regardless of
implementation language:

- All response fields MUST always be emitted; backends MUST NOT omit `null` properties from JSON
  output.
- `matches` MUST be `[]` and never `null` — including on error, timeout, and no-match.
- `captures` (on `MatchResult` and `GroupResult`) MUST be `null` unless `ShowCaptures` (32768) is
  set in the request `options`.
- Regex compile errors and the 15-second regex evaluation timeout MUST return **HTTP 200** with
  `error` populated (and `matches: []`) — never an HTTP error status.
- Request validation failures (e.g. a field over its `maxLength`) MUST return **HTTP 400** as an
  RFC 9457 `ProblemDetails` body, with `errors` mapping each invalid field to an array of message
  strings (`errors: { field: string[] }`), even on engines whose native validation framework
  produces a single string per field.
- The 5-second HTTP request timeout MUST return **HTTP 200** with
  `{ "error": "...timed out...", "replace": null, "matches": [] }` — **not** HTTP 408. (This is the
  Node.js behaviour; api-dotnet's previous 408 response is non-conformant and must be normalized.)
- Unsupported option bits MUST be ignored silently and MUST NOT produce an error, so a single
  bitmask stays portable across engines and a shared URL keeps working when the user switches
  engine.
- `ShowCaptures` (32768) MUST be stripped from the bitmask before any remaining bits reach the
  underlying regex engine/library call.
- CORS MUST allow `https://regextester.github.io`, plus any additional origin(s) listed in the
  backend's `ALLOW_CORS` configuration, plus localhost origins in development.
- A raw request body larger than `maxRequestBodyBytes` MUST return **HTTP 413** with an RFC 9457
  `ProblemDetails` JSON body (`type`, `title`, `status: 413`) — never HTML, never an empty body.
  This check MUST happen before the body is parsed or any field's `maxLength` is validated, so a
  body that is too large is always reported as 413, never 400, even if one of its fields would
  also have failed field-level validation.

### Further clarifications

These numbered rules were added after a conformance-suite run surfaced ambiguity or bugs in all
three backends. They are contractual MUST rules, equal in force to the bullets above:

1. **All matches, regardless of options.** `POST /api/regex` MUST return every non-overlapping
   match found in `text`, regardless of which option bits are set. Engine-specific "global" flags
   (e.g. JavaScript's `g`, bit 4096) only affect how a *native* client of that engine would iterate
   matches — they are presentation-level and MUST NOT change how many matches this API returns.
   A backend that returns only the first match unless a "global" bit is set is non-conformant.
2. **Empty pattern.** When `pattern` is `null` or the empty string `""`, the response MUST be
   `{ "error": null, "replace": null, "matches": [] }`. Backends MUST NOT treat an empty pattern
   as matching a zero-length string at every character position (which would otherwise produce one
   zero-length match per index in `text`).
3. **No wildcard CORS for disallowed origins.** A backend MUST NOT respond with
   `Access-Control-Allow-Origin: *` for an `Origin` that is not in its allow-list, in **any**
   environment, including Development. A development build MAY additionally permit localhost
   origins, but only by reflecting the specific requesting origin back in
   `Access-Control-Allow-Origin` — never by emitting a blanket `*`.

## 5. Limits

| Limit | Value |
|---|---|
| `pattern` max length | 512 characters |
| `text` max length | 1024 characters |
| `replace` max length | 1024 characters |
| `maxRequestBodyBytes` | 8192 bytes |
| Regex evaluation timeout | 15000 ms |
| HTTP request timeout | 5000 ms |

These are the *default* limits reported by every backend's `/api/capabilities`. An engine MUST NOT
report looser limits than these without also updating this document and the OpenAPI spec, since the
frontend and conformance suite validate against these exact numbers.

`maxRequestBodyBytes` bounds the size of the raw HTTP request body and is checked before the body
is parsed or any field is validated (§4). It exists as a defense against oversized requests
independent of, and enforced *before*, the per-field `maxLength` checks above. It MUST be
comfortably larger than `patternMaxLength + textMaxLength + replaceMaxLength` (512 + 1024 + 1024 =
2560) to leave headroom for JSON structural overhead (field names, quotes, braces, the `options`
number) and for multi-byte UTF-8 expansion (a single character can be up to 4 bytes). If the body
limit were at or below that sum, the maximum *valid* payload would itself be rejected with 413
before ever reaching field validation — which is exactly the bug this limit fixes, not reintroduces.
8192 was chosen as a round number with generous headroom over the 2560-character worst case.

## 6. Adding a new backend (e.g. Rust) — checklist

1. Implement all four endpoints: `GET /`, `GET /api/version`, `GET /api/capabilities`,
   `POST /api/regex`, matching the schemas in
   [regex-tester-api.v1.yaml](../open-api/regex-tester-api.v1.yaml) exactly.
2. Choose and report a new, stable, uppercase `engineKey` (e.g. `RUST`) and a human-readable
   `engineName` (e.g. `Rust`) from both `/api/version` and `/api/capabilities`.
3. Serve the canonical spec at `GET /openapi/v1.json` and an interactive explorer at
   `GET /scalar/v1`.
4. Map every flag in the registry (§3) that the chosen regex library supports, and declare the full
   registry (including unsupported flags) via `/api/capabilities.options`.
5. Follow every behavioural MUST rule in §4 — in particular, no null-omission, `matches: []` never
   `null`, HTTP 200 for regex errors/timeouts, HTTP 400 ProblemDetails for validation, HTTP 413
   ProblemDetails (before body parsing/field validation) when the body exceeds
   `maxRequestBodyBytes`, and the 5s timeout returning HTTP 200.
6. Pass the language-agnostic conformance suite (`tests/contract/`, see TASK-06) run against the new
   backend's `BASE_URL`.
7. Add a `ui-vuejs` engine entry (`src/config.<engine>.js`, registered in `src/config.js`) and a
   `VITE_API_<ENGINE>` environment variable in `.env` / `.env.production`.
8. Add a deploy workflow under `.github/workflows/` modelled on an existing backend's workflow.
9. Add a design doc under `docs/design/` (e.g. `api-rust.md`) mirroring the structure of
   [api-nodejs.md](api-nodejs.md).

## 7. Known engine divergences

Legitimate, permanent behavioural differences between engines — not drift to be fixed, but
documented so clients don't assume identical output everywhere:

| Behaviour | api-dotnet | api-nodejs | api-python |
|---|---|---|---|
| `features.captures` | `multi` — `System.Text.RegularExpressions` retains every capture of a repeated group via `Group.Captures` | `single` — the JS `RegExp`/`String.matchAll` API only exposes the last capture per group | `single` — Python's `re` module only exposes the last capture per group via `Match.groups()` |
| `ExplicitCapture`, `Compiled`, `RightToLeft`, `ECMAScript`, `CultureInvariant`, `NonBacktracking` | native support | no native equivalent; bits are accepted and ignored | no native equivalent; bits are accepted and ignored |
| `HasIndices`, `Global`, `Unicode`, `UnicodeSets`, `Sticky` | no native equivalent; bits are accepted and ignored | native JS `RegExp` flags | no native equivalent; bits are accepted and ignored |
| `Ascii` | no native equivalent; bit is accepted and ignored | no native equivalent; bit is accepted and ignored | native `re.ASCII` |

Engines MUST still accept and silently ignore any bit they don't implement (§4) — this table only
explains *why* the same bitmask can produce different (but each individually correct) results per
engine.
