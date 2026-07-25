# TASK-09 — Merge `GET /api/version` into `GET /api/capabilities`

| | |
|---|---|
| **Phase** | 5 |
| **Depends on** | TASK-08 |
| **Blocks** | TASK-10 |
| **Plan** | [docs/plan/2026-07-25-api-contract-and-python-backend.md](../plan/2026-07-25-api-contract-and-python-backend.md) |
| **Status** | Not started |

## Context

The v1 contract currently defines two separate read-only metadata endpoints:

- `GET /api/version` → `{ engineKey, engineName, contractVersion, os, framework }`
- `GET /api/capabilities` → `{ engineKey, engineName, contractVersion, defaultOptions, limits, features, options }`

Three of the five `/api/version` fields (`engineKey`, `engineName`, `contractVersion`) are already
duplicated in `/api/capabilities`. Both are cached for 24 hours, both are static for a given deployment,
and the frontend calls both back-to-back on every engine switch — two round trips for one logical
question ("what is this engine and what can it do?").

Two endpoints is redundant. Collapse them into one.

`/api/capabilities` is the survivor. `/api/version` is **removed entirely** from all three backends.

## Contract change

This is a **breaking change** to the v1 contract. That is acceptable and deliberate: v1 has never been
deployed or consumed by any third party — every consumer lives in this repository. Do **not** introduce a
v2, do **not** keep `/api/version` as a deprecated alias, and do **not** add a redirect. Delete it.

`contractVersion` stays `"1.0"`.

### New `Capabilities` shape

The two `/api/version`-only fields (`os`, `framework`) move into a new required nested `runtime` object.
Nesting keeps host diagnostics visually separate from the contract-level identity fields and leaves room
for future runtime facts without polluting the top level.

```json
{
  "engineKey": "PYTHON",
  "engineName": "Python",
  "contractVersion": "1.0",
  "runtime": {
    "os": "Windows 11 10.0.26100 AMD64",
    "framework": "Python 3.13.0"
  },
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
  "options": [ /* CapabilityOption[] */ ]
}
```

`Capabilities.required` becomes:
`engineKey`, `engineName`, `contractVersion`, `runtime`, `defaultOptions`, `limits`, `features`, `options`.

New `Runtime` schema, `required`: `os`, `framework`. Both plain non-nullable strings.

### Deprecated aliases are dropped

`api-nodejs` currently emits `osDescription` and `frameworkDescription` alongside `os`/`framework` as
"deprecated aliases retained for one release". This is that release. **Remove them.** They must not appear
anywhere in the new `runtime` object, in `src/schemas.js`, or in the canonical spec.

## What changes

### 1. Canonical contract — `docs/open-api/regex-tester-api.v1.yaml`

- Delete the `/api/version` path item.
- Delete the `VersionResult` schema (including the two deprecated alias properties).
- Add a `Runtime` schema and reference it from `Capabilities.properties.runtime`.
- Add `runtime` to `Capabilities.required` and to the `Capabilities` example.
- The document must still lint clean: `npx.cmd @redocly/cli lint docs/open-api/regex-tester-api.v1.yaml`
  must report **0 errors** (the 4 pre-existing warnings about missing 2xx/4xx responses are accepted;
  removing the `/api/version` path should reduce that count by one).

### 2. Narrative spec — `docs/design/api-contract.md`

- Delete the `### GET /api/version` section.
- Fold `runtime` into the `GET /api/capabilities` section with an updated example body.
- Update the contract-versioning paragraph that currently says `contractVersion` is reported by *both*
  endpoints.
- Update the "adding a new backend" checklist: it says "implement all four endpoints" — it is now three
  (`GET /`, `GET /api/capabilities`, `POST /api/regex`).
- Add a short note under the endpoint description recording that `runtime` is diagnostic only and MUST NOT
  be used to drive frontend behaviour.

### 3. api-dotnet

- Delete `Models/VersionResult.cs`.
- Delete the `/api/version` action from `Controllers/HomeController.cs` (keep `GET /` → 302 redirect) and
  remove its now-dead caching fields and `using` directives.
- Add a `Runtime` model (`Os`, `Framework`) to `Models/Capabilities.cs` and a `Runtime` property on
  `CapabilitiesResult`, populated from `RuntimeInformation.OSDescription` and
  `RuntimeInformation.FrameworkDescription`.
- `dotnet build` must succeed with no new warnings.

### 4. api-nodejs

- Delete the `version` handler from `src/controllers/homeController.js` and its route registration in
  `src/index.js`.
- Add `runtime: { os, framework }` to `getCapabilities()` in `src/services/capabilities.js`, using the
  same `os.type()/os.release()/os.arch()` and `Node.js ${process.version}` values the version handler used.
- Drop `osDescription`/`frameworkDescription` entirely.
- Remove the `VersionResult` schema and the `/api/version` `@openapi` JSDoc block from `src/schemas.js` /
  the controllers; add a `Runtime` schema and wire it into the `Capabilities` schema.

### 5. api-python

- Delete the `/api/version` route from `src/routers/home.py` and the now-dead module-level version cache.
- Delete the `VersionResult` model from `src/models.py`; add a `Runtime` model and a required `runtime`
  field on `Capabilities`.
- Populate `runtime` in `src/services/capabilities.py` from `platform.system()/release()/machine()` and
  `platform.python_version()`.

### 6. Conformance suite — `tests/contract/`

- Delete `src/specs/version.spec.js`.
- Move its three meaningful assertions into `src/specs/capabilities.spec.js`: response validates against
  the `Capabilities` schema, `engineKey` is a non-empty string, `contractVersion === "1.0"`.
- Add assertions that `runtime.os` and `runtime.framework` are non-empty strings.
- Add a regression test asserting `GET /api/version` now returns **404**.
- Add an assertion that the response does **not** contain `osDescription` or `frameworkDescription`.
- Update the spec-file table in `tests/contract/README.md`.
- The suite must pass against all three backends.

### 7. CI — `.github/workflows/contract-tests.yml`

Change the readiness probe from `/api/version` to `/api/capabilities`. Keep the bounded retry loop.

### 8. Frontend — `ui-vuejs/`

- Remove the `API.INFO` key from `config.dotnet.js`, `config.nodejs.js` and `config.python.js`.
- In `src/components/RegexTester.vue`, collapse `warmUpApiServer()` so an engine switch makes **one**
  request to `/api/capabilities` instead of two. Derive the header's engine tooltip string from
  `data.runtime.framework`.
- Collapse the two separate caches (`versionCache` + `capabilitiesCache`) into a single cache keyed by
  engine, with a single TTL constant. Keep the existing offline behaviour: on failure the tooltip shows
  `offline` and the bundled per-engine config is used for the option list.
- Do **not** change how option checkboxes are rendered — that is TASK-10's job.
- `npm.cmd run build` and `npm.cmd run build-prod` must both succeed.

### 9. Regenerate per-backend OpenAPI documents into `docs/open-api/`

Each backend serves its own generated document at `GET /openapi/v1.json`. Export the **live** document from
each running backend — do not hand-write or hand-edit these files.

Target layout (flat, alongside the canonical spec):

```
docs/open-api/
├── regex-tester-api.v1.yaml   # canonical, hand-maintained, engine-agnostic
├── api-dotnet.v1.json         # generated
├── api-nodejs.v1.json         # generated
└── api-python.v1.json         # generated
```

- Delete the old `docs/open-api/api-dotnet/RegExTester.Api.DotNet.json` and its now-empty directory.
- Write each file as pretty-printed JSON with a trailing newline so diffs stay readable.
- Add a short `docs/open-api/README.md` explaining which file is canonical, which are generated, and the
  exact commands used to regenerate them.

## Out of scope

- Any change to `POST /api/regex` request/response shapes.
- Any change to the option flag registry or the bitmask values.
- Hiding unsupported options or removing the flag badge in the UI — that is TASK-10.
- Introducing a v2 contract.

## Acceptance criteria

- [ ] `GET /api/version` returns 404 on all three backends.
- [ ] `GET /api/capabilities` on all three backends returns a `runtime` object with non-empty `os` and
      `framework`, and validates against the updated canonical `Capabilities` schema.
- [ ] No response anywhere contains `osDescription` or `frameworkDescription`.
- [ ] `VersionResult` no longer exists in any backend, in the canonical spec, or in any generated document.
- [ ] The canonical spec lints with 0 errors.
- [ ] `tests/contract` passes against all three backends (`BASE_URL=http://localhost:5000|5100|5200`).
- [ ] `dotnet build` succeeds; `ui-vuejs` builds in both dev and prod modes.
- [ ] `docs/open-api/` contains exactly the four files listed above plus `README.md`, and each generated
      document declares exactly the paths `/`, `/api/capabilities` and `/api/regex`.
- [ ] `grep -ri "api/version"` across the repo returns hits only in `docs/tasks/` and `docs/plan/`
      (historical task specs describing this work).
- [ ] `CLAUDE.md` and every file in `docs/design/` no longer document `/api/version` as a live endpoint.

## Report back

List every file created, modified and deleted; the final `runtime` JSON emitted by each backend; the exact
commands used to regenerate the OpenAPI documents; the conformance-suite result per backend; and any
acceptance criterion you could not satisfy, with the reason.
