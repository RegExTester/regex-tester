---
name: add-engine
description: 'Plan and execute adding a brand-new backend (BE) engine to this mono-repo — a new api-<language> project implementing the same canonical v1 API contract as api-dotnet, api-nodejs and api-python. Use when asked to add a Rust, Go, Java, PHP, Ruby, C++ or any other language backend / regex engine. Writes a plan to docs/plan/, task specs to docs/tasks/, scaffolds the new project mirroring the existing backends, registers it in the ui-vuejs frontend, adds CI deploy + contract-test workflows, and documents it. Triggers: "add a new backend", "add a Rust engine", "support another language", "new API project".'
argument-hint: 'Language / runtime for the new engine, e.g. "Rust with axum"'
---

# Add a new backend engine

The contract is engine-agnostic by design, so this is a **drop-in exercise**: copy the shape of the three
existing backends, do not invent a new one. If you find yourself designing something novel, you have gone
wrong — go read how the other three do it.

Read [references/repo-map.md](./references/repo-map.md) for layouts, ports and commands, and
[references/conventions.md](./references/conventions.md) for the rules the new engine must satisfy.
The authoritative checklist is [references/new-engine-checklist.md](./references/new-engine-checklist.md).

## Order of operations

1. **Discover** — read the contract and all three existing backends
2. **Plan** → `docs/plan/YYYY-MM-DD-add-<engine>-backend.md`
3. **Tasks** → `docs/tasks/TASK-NN-*.md` + register in `docs/tasks/README.md`
4. **Scaffold + implement** the new backend
5. **Make the conformance suite pass** — this is the definition of done
6. **Frontend** registration
7. **CI** — deploy workflow + contract-test matrix entry
8. **Docs**
9. **Verify + commit**

## 1. Discover

Read all of these before writing any code:

- [docs/design/api-contract.md](../../../docs/design/api-contract.md) — especially the
  "adding a new backend" checklist
- [docs/open-api/regex-tester-api.v1.yaml](../../../docs/open-api/regex-tester-api.v1.yaml)
- All three of `api-dotnet/ARCHITECTURE.md`, `api-nodejs/ARCHITECTURE.md`, `api-python/ARCHITECTURE.md`
- `api-python/` in full — it is the newest and cleanest reference implementation

Then assess the **target language's regex engine** and record, per flag in the
[CLAUDE.md](../../../CLAUDE.md) table, whether it maps natively, needs emulation, or is a no-op.
Also determine: does it support named groups? multiple captures per group? lookbehind? a native
match timeout? Anything without a native timeout needs an explicit deadline mechanism.

## 2. Plan

`docs/plan/YYYY-MM-DD-add-<engine>-backend.md` with: the goal, the chosen framework and why, a
**flag-by-flag mapping table** for the new engine, how the 15 s regex and 5 s request timeouts will be
implemented, the port, the deployment runtime, and the task breakdown.

## 3. Tasks

Split into independently-executable task files (scaffold+contract, telemetry, frontend, CI, docs) using
the existing task template, and register them in `docs/tasks/README.md` including the mermaid dependency
graph and the disjoint file-ownership table.

## 4. Scaffold and implement

Create `api-<engine>/` mirroring the existing separation of concerns:

```
api-<engine>/
  <entrypoint>          # app, CORS, middleware order, routes
  routers|controllers/  # home (redirect + capabilities), regex
  services/             # regex processor, capabilities (+ ENGINE_KEY), telemetry
  options.*             # bitmask -> native flag mapping + option registry
  middleware/           # request timeout, max body size
```

Non-negotiables:

- `ENGINE_KEY` is a **single constant** reused by both capabilities and telemetry
- Pick the next free port — **5300** if the three current backends are unchanged
- Every rule in [references/conventions.md](./references/conventions.md) applies from day one

## 5. Make the conformance suite pass

This is the definition of done. The suite is language-agnostic and already encodes the contract:

```powershell
Push-Location d:\git\regex-tester\tests\contract; $env:BASE_URL='http://localhost:5300'; node .\node_modules\vitest\vitest.mjs run
```

Do not modify the suite to accommodate the new engine. If a test fails, the engine is wrong — unless
you have found a genuine contract ambiguity, in which case fix the contract for **all** engines.

## 6. Frontend

- Add `ui-vuejs/src/config.<engine>.js` (copy an existing one, change the key/name)
- Register it in `ui-vuejs/src/config.js`
- Add `VITE_API_<ENGINE>` to both `.env` (localhost:5300) and `.env.production` (the Azure host)

Options render automatically from `GET /api/capabilities` — no per-engine UI branching. Verify the
carried-bits round trip described in [references/conventions.md](./references/conventions.md).

## 7. CI

- New `.github/workflows/deploy-api-<engine>.yml`, copied from the closest existing one: path-filtered
  push to `main` + `workflow_dispatch`, `azure/login@v2` with `secrets.AZURE_CREDENTIALS`,
  `azure/webapps-deploy@v3`. **Do not invent new secrets.**
- Add the engine to the `contract-tests.yml` matrix (engine name, port, SDK setup, start command). The
  readiness probe polls `GET /api/capabilities`.

## 8. Docs

`api-<engine>/ARCHITECTURE.md` using the **same 10 sections** as the other three, plus
`docs/design/api-<engine>.md`. Update `README.md`, `ARCHITECTURE.md`, `DEPLOYMENT.md`, `CLAUDE.md`
(project table, commands, flag table column) and `docs/open-api/README.md`. Generate
`docs/open-api/api-<engine>.v1.json`.

## 9. Verify

Run through [references/new-engine-checklist.md](./references/new-engine-checklist.md) yourself — do not
trust a subagent's report. Confirm all four backends still pass the suite, then kill every server you
started and commit.
