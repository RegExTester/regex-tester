# TASK-16 — Frontend: register the Java engine

| | |
|---|---|
| **Phase** | 9 |
| **Depends on** | TASK-15 |
| **Blocks** | — |
| **Plan** | [docs/plan/2026-07-25-add-java-backend.md](../plan/2026-07-25-add-java-backend.md) |
| **Status** | Done |

## Context

`ui-vuejs` renders its option checkboxes from each engine's `GET /api/capabilities`, so adding an
engine is configuration, not code: no per-engine branching exists or may be introduced. The bundled
`config.<engine>.js` files are only a **fallback** used before (or if) the capabilities call
resolves.

## Decisions

- The bundled fallback for Java lists exactly the six bits TASK-15 reports as supported:
  `IgnoreCase`, `Multiline`, `Singleline`, `IgnorePatternWhitespace`, `Unicode`, `ShowCaptures`.
  It must not list `Ascii` — Java reports that bit unsupported (plan D3).
- `DEFAULT_OPTIONS` is `IgnoreCase | Multiline` (3), matching the backend's `defaultOptions`.
- `Index: 3` places Java last in the dropdown; `DEFAULT_ENGINE` stays `DOTNET`.

## Deliverables

| File | Change |
|---|---|
| `ui-vuejs/src/config.java.js` | New engine config, modelled on `config.python.js`. |
| `ui-vuejs/src/config.js` | Import and register `JAVA` in `ENGINES`. |
| `ui-vuejs/.env` | `VITE_API_JAVA=http://localhost:5300` |
| `ui-vuejs/.env.production` | `VITE_API_JAVA=https://regex-tester-api-java.azurewebsites.net` |

## Acceptance criteria

- The engine dropdown offers a fourth entry, "Java".
- Selecting it renders options from `/api/capabilities` with no per-engine branching.
- **Carried bits round trip**: set a bit Java does not expose (e.g. `Ascii`, 131072) on Python,
  switch to Java and back, and confirm the bit still survives in the URL. This is the regression that
  silently corrupts shared links if `computeCarriedBits` is bypassed.
- `npm run build-prod` succeeds.

## Out of scope

Any change to `RegexTester.vue` — capability-driven rendering already handles a new engine.
