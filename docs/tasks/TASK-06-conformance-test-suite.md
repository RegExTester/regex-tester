# TASK-06 — Cross-backend conformance test suite

| | |
|---|---|
| **Phase** | 3 |
| **Depends on** | TASK-02 (canonical contract) |
| **Blocks** | TASK-08 |
| **Runs in parallel with** | TASK-03, TASK-04, TASK-05 |
| **Plan** | [docs/plan/2026-07-25-api-contract-and-python-backend.md](../plan/2026-07-25-api-contract-and-python-backend.md) |
| **Status** | Not started |

## Context

The contract is only real if it is enforced. Build **one** language-agnostic HTTP test suite that runs
unchanged against any backend, driven by a base URL. It is the gate a future Rust backend must pass.

Read `docs/open-api/regex-tester-api.v1.yaml` and `docs/design/api-contract.md` first.

**Only create files under `tests/contract/`.** Do not modify any backend.

## What changes

### New project: `tests/contract/`

```
tests/contract/
├── package.json
├── vitest.config.js
├── README.md
└── src/
    ├── client.js          # fetch helpers bound to BASE_URL
    ├── schema.js          # loads the canonical YAML, compiles ajv validators
    └── specs/
        ├── redirect.spec.js
        ├── version.spec.js
        ├── capabilities.spec.js
        ├── regex-match.spec.js
        ├── regex-groups.spec.js
        ├── regex-captures.spec.js
        ├── regex-replace.spec.js
        ├── regex-errors.spec.js
        ├── validation.spec.js
        ├── options.spec.js
        └── cors.spec.js
```

- Stack: Node 22, **vitest**, **ajv** (2020-12 dialect — import from `ajv/dist/2020`),
  **ajv-formats**, **js-yaml** (or `@apidevtools/swagger-parser` to resolve `$ref`s).
- Config: `BASE_URL` env var, required, no default. Fail fast with a clear message if unset.
- `package.json` scripts:
  - `"test": "vitest run"`
  - `"test:dotnet": "cross-env BASE_URL=http://localhost:5000 vitest run"` (or use `BASE_URL=… node`
    portably — prefer a small `run.js` wrapper over adding `cross-env` if you want zero extra deps)
  - `"test:nodejs"` → `http://localhost:5100`
  - `"test:python"` → `http://localhost:5200`
- `src/schema.js` must dereference the canonical YAML and expose
  `validate(schemaName, payload)` returning `{ valid, errors }`. **Every** response assertion in the suite
  must run through this so a schema change automatically tightens the tests.

### Required test cases

| Spec | Cases |
|---|---|
| `redirect` | `GET /` returns 302 with `Location: https://regextester.github.io/`; redirects not followed |
| `version` | 200; validates against `VersionResult`; `engineKey` non-empty; `contractVersion` is `"1.0"` |
| `capabilities` | 200; validates against `Capabilities`; `Cache-Control` max-age 86400; `options` non-empty; no option has `value: 128`; every option value is a power of two; `defaultOptions` only contains bits that are `supported: true` |
| `regex-match` | `\d+` over `a1b22c` → 2 matches at indices 1 and 3, values `1` and `22`; `error` null; response validates against `RegexResult`; no-match pattern → `matches: []`; empty pattern → `matches: []` |
| `regex-groups` | `(?<y>\d{4})-(?<m>\d{2})` over `2026-07` → one match, groups named `y` and `m` with correct index/length/value; numeric groups reported as `"1"`, `"2"` when unnamed |
| `regex-captures` | `ShowCaptures` **off** → `captures` is `null` on match and groups; `ShowCaptures` **on** (bit 32768) → `captures` is an array. For `(\w)+`, assert length ≥ 1 and, when `capabilities.features.captures === "multi"`, assert length > 1 — this is the **only** engine-conditional assertion allowed |
| `regex-replace` | `(\w+) (\w+)` / `hello world` / `$2 $1` → `replace: "world hello"`; omitting `replace` → `replace: null` |
| `regex-errors` | `([` → **HTTP 200**, `error` non-null, `matches: []`, `replace: null`; body still validates against `RegexResult` |
| `validation` | 513-char `pattern` → 400; 1025-char `text` → 400; 1025-char `replace` → 400; each body validates against `ProblemDetails`; `status` is 400; every `errors` value is an **array of strings**; the key is the bare field name |
| `options` | omitting `options` → 200; `options: 0` → 200; unknown bit `1 << 20` → 200 with no error; `options: 4096` → 200 with no error on every engine; an engine-unsupported bit OR'd with `IgnoreCase` still matches case-insensitively |
| `cors` | `OPTIONS /api/regex` with `Origin: https://regextester.github.io` returns an `Access-Control-Allow-Origin` header; a disallowed origin does not receive a permissive wildcard |

### Universal invariants — assert in a shared helper used by every `/api/regex` spec

- The response body has the keys `error`, `replace`, `matches` — **present even when null**
  (use `Object.hasOwn`, not truthiness).
- `matches` is an array, never `null`.
- Every `MatchResult` has all six keys present; every `GroupResult` has all five.
- The body validates against the canonical `RegexResult` schema.

### `README.md`

Document: prerequisites, how to start each backend, how to run the suite against one backend, the
`BASE_URL` contract, and the statement that **a new backend is considered contract-compliant when this
suite passes unmodified**.

## Out of scope

- Do not start or manage backend processes from the suite — it assumes a backend is already listening.
- Do not add engine-specific test files. The only permitted engine-conditional branch is the
  `features.captures` check described above.
- Do not modify `api-dotnet/`, `api-nodejs/`, `api-python/`, or `ui-vuejs/`.
- The CI workflow that runs this suite is TASK-08.

## Acceptance criteria

- [ ] `cd tests/contract; npm install` succeeds.
- [ ] `npm test` without `BASE_URL` fails immediately with a clear, actionable message.
- [ ] With `api-nodejs` running, `BASE_URL=http://localhost:5100 npm test` executes the full suite.
      (Some assertions may fail until TASK-05 lands — report which, do not weaken the assertions.)
- [ ] Every `/api/regex` assertion goes through the shared schema validator built from
      `docs/open-api/regex-tester-api.v1.yaml`; no hand-written duplicate schema exists in the suite.
- [ ] All eleven spec files exist and contain the cases listed above.
- [ ] Grep confirms no occurrence of `DOTNET`, `NODEJS`, or `PYTHON` used to branch test logic, except in
      the single `features.captures` conditional.
- [ ] The suite exits with a non-zero code when any assertion fails.
- [ ] No file outside `tests/contract/` is created or modified.

## Report back

The file list, the exact dependency versions chosen, the results of running the suite against
`api-nodejs`, and a list of any assertion that currently fails with the reason.
