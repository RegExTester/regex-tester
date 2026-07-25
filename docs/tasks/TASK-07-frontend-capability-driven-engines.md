# TASK-07 — Frontend: capability-driven engines + Python engine

| | |
|---|---|
| **Phase** | 4 |
| **Depends on** | TASK-02, TASK-03, TASK-04, TASK-05 |
| **Blocks** | TASK-08 |
| **Plan** | [docs/plan/2026-07-25-api-contract-and-python-backend.md](../plan/2026-07-25-api-contract-and-python-backend.md) |
| **Status** | Done |

## Context

`ui-vuejs` currently hardcodes each engine's supported regex options in `config.dotnet.js` and
`config.nodejs.js`. Every new backend therefore requires a new frontend config file. Now that all backends
expose `GET /api/capabilities`, the frontend should build its option checkboxes from that response, keeping
the bundled config only as an offline fallback.

Read `docs/design/api-contract.md` first.

**Only modify files under `ui-vuejs/`.**

## What changes

### 1. Fix the existing bug

`ui-vuejs/src/config.nodejs.js` sets `API.REGEX = apiBase + '/api/version'`. It must be
`apiBase + '/api/regex'`. This is a live bug — the Node.js engine currently POSTs to the wrong endpoint.

### 2. New file `ui-vuejs/src/config.python.js`

Mirror the shape of `config.dotnet.js`:

- `const apiBase = import.meta.env.VITE_API_PYTHON`
- `DEFAULT_OPTIONS`: `1 | 2` (IgnoreCase | Multiline) = `3`
- `REGEX_OPTIONS`: the options Python supports — `IgnoreCase` (1), `Multiline` (2), `Singleline` (16),
  `IgnorePatternWhitespace` (32), `Ascii` (131072), `ShowCaptures` (32768) — each as `{ Value, Name }`
  with no `Flag` (Python has no user-facing inline flag letters).
- `API.INFO`: `apiBase + '/api/version'`
- `API.REGEX`: `apiBase + '/api/regex'`
- Add `API.CAPABILITIES`: `apiBase + '/api/capabilities'`

Add the same `API.CAPABILITIES` entry to `config.dotnet.js` and `config.nodejs.js`.

### 3. Register the engine in `ui-vuejs/src/config.js`

- Import `CONFIG_PYTHON`.
- Add `PYTHON: { Name: 'Python', Key: 'PYTHON', Index: 2, ...CONFIG_PYTHON }` to `CONFIG.ENGINES`.
- Leave `DEFAULT_ENGINE` as `'DOTNET'`.
- Index values are load-bearing: they are the 4th URL path segment. `DOTNET=0`, `NODEJS=1`, `PYTHON=2`
  must not change.

### 4. Environment variables

- `ui-vuejs/.env` — add `VITE_API_PYTHON=http://localhost:5200`
- `ui-vuejs/.env.production` — add `VITE_API_PYTHON=https://regex-tester-api-python.azurewebsites.net`

### 5. Capability-driven options in `ui-vuejs/src/components/RegexTester.vue`

Current behaviour: `rebuildOptions(engineKey, bitmask)` maps over
`engineConfig(engineKey).REGEX_OPTIONS` to build the `options` ref. `onEngineChange()` calls
`applyDefaultOptions()`, `warmUpApiServer()`, then `delaySubmit()`.

New behaviour:

- Add a `fetchCapabilities(engineKey)` function that GETs `API.CAPABILITIES` for the engine.
- Cache the result per engine in a module-scope map with the **same 10-minute TTL** already used by the
  version cache (`VERSION_CACHE_TTL`). Reuse the existing constant; do not introduce a second TTL.
- When capabilities are available, build the checkbox list from `capabilities.options`:
  - Include options where `supported === true`.
  - Render options where `supported === false` as **disabled** checkboxes with a tooltip such as
    "Not supported by this engine", so users can see why a shared URL's flag has no effect.
  - `name` from `option.name`, `value` from `option.value`, `flag` from `option.flag` (may be `null`),
    `checked` from `(bitmask & value) === value`.
- On the **first** load of an engine (no bitmask in the URL), seed the bitmask from
  `capabilities.defaultOptions` rather than the bundled `DEFAULT_OPTIONS`.
- If the capabilities request fails, times out, or returns a non-200, **fall back silently** to the
  existing bundled `REGEX_OPTIONS` path. The app must remain fully usable with every backend offline.
- Fold the capabilities fetch into the existing `warmUpApiServer()` flow so an engine switch performs at
  most one extra round trip.
- Surface `capabilities.limits.patternMaxLength` / `textMaxLength` as the `maxlength` attributes on the
  pattern and text inputs, falling back to 512 / 1024.

### 6. Response handling unchanged, but tolerate the normalized shape

The backends now always return `matches: []` instead of `null` on error, and always emit `null` properties.
Confirm the rendering code handles both (it should already). Do not add defensive code beyond what is
needed.

## Out of scope

- Do not change the Base64Url encoding or the URL path scheme.
- Do not modify any backend.
- Do not restyle the UI beyond adding the disabled-checkbox state.
- Design-doc updates are TASK-08.

## Acceptance criteria

- [ ] `cd ui-vuejs; npm install; npm run build` succeeds.
- [ ] `ui-vuejs/src/config.nodejs.js` `API.REGEX` ends with `/api/regex`.
- [ ] All three engine configs expose `API.INFO`, `API.REGEX`, and `API.CAPABILITIES`.
- [ ] `VITE_API_PYTHON` is present in both `.env` and `.env.production`.
- [ ] With all three backends running, the engine dropdown lists **.Net**, **Node.js**, **Python**.
- [ ] Switching engines changes the option checkbox list to match that engine's
      `/api/capabilities` response, with unsupported options shown disabled.
- [ ] Selecting the Python engine and testing `\d+` against `a1b22c` highlights `1` and `22`.
- [ ] The shared URL round-trips: `/:pattern/:text/:options/2` restores the Python engine, the pattern,
      the text, and the checked options after a page reload.
- [ ] Switching from an engine with option bit 1024 checked to Python does not error; the bit is preserved
      in the URL and shown as a disabled/unsupported option.
- [ ] With **all** backends stopped, the app still loads, the dropdown still works, and the option list
      falls back to the bundled config — no unhandled promise rejection in the console.
- [ ] `npm run build-prod` succeeds and the built bundle references the production Python URL.
- [ ] No file outside `ui-vuejs/` is modified.

## Report back

The file list, how the capabilities cache was integrated with the existing version cache, the fallback
behaviour you implemented, and the outcome of each acceptance check.
