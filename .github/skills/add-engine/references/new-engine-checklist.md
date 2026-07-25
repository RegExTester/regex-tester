# New engine checklist

Work top to bottom. Every box must be **verified**, not assumed. `<engine>` is the lowercase engine
name (e.g. `rust`), `<ENGINE>` the uppercase engine key (e.g. `RUST`).

## Planning

- [ ] `docs/plan/YYYY-MM-DD-add-<engine>-backend.md` written, with a flag-by-flag mapping table
- [ ] Task files created in `docs/tasks/` using the existing template
- [ ] `docs/tasks/README.md` updated: status table, mermaid graph, waves, file-ownership table

## Project scaffold

- [ ] `api-<engine>/` created, mirroring the existing separation of concerns
- [ ] Listens on the next free port (**5300** if the current three are unchanged)
- [ ] `ENGINE_KEY = "<ENGINE>"` declared **once** and reused by capabilities *and* telemetry
- [ ] Dependencies pinned to explicit versions
- [ ] A `.gitignore` entry exists for the language's build/venv output

## Endpoints

- [ ] `GET /` → **302** to `https://regextester.github.io/`
- [ ] `GET /api/capabilities` → `engineKey`, `engineName`, `contractVersion` `"1.0"`, nested required
      `runtime { os, framework }`, `defaultOptions`, `limits`, `features`, `options[]`; cached 24 h
- [ ] `POST /api/regex` → `{ error, replace, matches[] }`
- [ ] `GET /openapi/v1.json` and a UI at `/scalar/v1`
- [ ] **No** `/api/version` — it was removed from the contract

## Response contract

- [ ] All fields always emitted; no null-omission
- [ ] `matches` is `[]` and never `null`, including on error
- [ ] Match objects carry `{ name, index, length, value, groups[], captures[] }`
- [ ] Empty/null pattern → `{ "error": null, "replace": null, "matches": [] }`

## Options

- [ ] Bitmask parsed; **unsupported bits ignored silently, never rejected**
- [ ] Per-flag `supported: true|false` reported in the capabilities registry
- [ ] Bit **128 left unallocated** (permanently reserved)
- [ ] `ShowCaptures` (32768) stripped before regex execution
- [ ] Any flag needing emulation is either implemented or reported `supported: false` — never silently wrong

## Limits, timeouts and errors

- [ ] `pattern` ≤ 512, `text` ≤ 1024, `replace` ≤ 1024 → over-length gives **HTTP 400** ProblemDetails
      with `errors: { field: string[] }`
- [ ] Raw body > 8192 bytes → **HTTP 413** ProblemDetails, checked **before** parsing and before
      `maxLength` validation
- [ ] 15 s regex timeout → **HTTP 200** with `error` populated
- [ ] 5 s request timeout → **HTTP 200** with `error` populated, **never 408**
- [ ] Regex compile/syntax errors → **HTTP 200** with `error` populated
- [ ] Limits reported in `GET /api/capabilities` match the enforced values

## CORS

- [ ] Never `Access-Control-Allow-Origin: *`
- [ ] Allows `https://regextester.github.io` + configurable allow-list (`ALLOW_CORS`, comma-separated)
- [ ] Reflects `http(s)://localhost[:port]` **only in development**, with production defaulting to strict

## Telemetry

- [ ] Writes the standardized 12-field document: `id`, `engineKey`, `timestamp`, `host`, `userAgent`,
      `pattern`, `text`, `replace`, `options` (integer), `durationMs`, `matchCount`, `error`
- [ ] Database `regex-tester-db`, container `telemetry`, partition key **`/timestamp`** (matching the
      existing backends — never introduce a different key)
- [ ] If the SDK requires an explicit partition key value on write, it is `timestamp`, matching the
      container path — a mismatch fails every write silently
- [ ] **Fire-and-forget** — never awaited on the request path, all errors swallowed
- [ ] Empty connection string disables telemetry silently
- [ ] **Proven**: with a syntactically valid but *unreachable* connection string, the app still starts and
      `POST /api/regex` still returns a correct HTTP 200
- [ ] No client-IP collection

## Conformance suite — the definition of done

- [ ] Passes 100 % against `BASE_URL=http://localhost:5300`
- [ ] The suite was **not** modified to accommodate the engine
- [ ] All pre-existing backends still pass (5000, 5100, 5200)

## Frontend

- [ ] `ui-vuejs/src/config.<engine>.js` added
- [ ] Registered in `ui-vuejs/src/config.js`
- [ ] `VITE_API_<ENGINE>` added to **both** `.env` and `.env.production`
- [ ] Engine appears in the dropdown; options render from capabilities with no per-engine branching
- [ ] Carried-bits round trip verified in a browser: set a bit this engine lacks on another engine,
      switch to this one and back, confirm the bit survives in the URL
- [ ] `npm run build-prod` succeeds

## CI/CD

- [ ] `.github/workflows/deploy-api-<engine>.yml` added, path-filtered + `workflow_dispatch`
- [ ] Deploy job is **gated on the test suite** — a `test` job with
      `uses: ./.github/workflows/contract-tests.yml` and `needs: test` on `build-and-deploy`,
      matching the four existing deploy workflows. Never pass `secrets: inherit` to it.
- [ ] The new engine is added to the `contract-tests.yml` matrix, so it gates every *other*
      project's deploys too
- [ ] Uses `azure/login@v2` with `secrets.AZURE_CREDENTIALS` and `azure/webapps-deploy@v3`
- [ ] **No new secrets invented** — only `AZURE_CREDENTIALS` and `PAGES_DEPLOY_TOKEN` exist
- [ ] Added to the `contract-tests.yml` matrix with the right SDK setup, start command and port
- [ ] Any production-only env var (e.g. an `ENVIRONMENT=production` equivalent) is documented as an
      App Service **app setting** in DEPLOYMENT.md §3 — CI does not set app settings, because that
      would require `azure/CLI@v2` and a resource group

## Documentation

- [ ] `api-<engine>/ARCHITECTURE.md` using the **same 10 sections** as the other backends
- [ ] `docs/design/api-<engine>.md`
- [ ] `docs/open-api/api-<engine>.v1.json` generated with the `node -e "fetch(...)"` command
      (never `ConvertTo-Json`)
- [ ] `README.md` project table + quick start
- [ ] Root `ARCHITECTURE.md` component diagram, project table and divergences
- [ ] `DEPLOYMENT.md` provisioning, app settings and verification steps
- [ ] `CLAUDE.md` project table, commands, key files and a new column in the flag table
- [ ] `docs/open-api/README.md` regeneration command
- [ ] Every new relative link resolves to a file that exists

## Final

- [ ] All four backends build and start cleanly
- [ ] Conformance suite green on all four ports
- [ ] **Every server started during this work is killed**
- [ ] Working tree contains no stray build output or secrets
- [ ] Committed with a message explaining the engine choice and the flag-mapping decisions
