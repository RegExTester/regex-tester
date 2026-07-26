# TASK-24 — Harden the cache-header assertion and document the timeout policy

| | |
|---|---|
| **Phase** | 17 |
| **Depends on** | TASK-23 |
| **Blocks** | — |
| **Plan** | [docs/plan/2026-07-26-frontend-request-timeouts.md](../plan/2026-07-26-frontend-request-timeouts.md) |
| **Status** | Done |

## Context

TASK-23 makes the frontend depend on the capability document's 24-hour HTTP cache instead of a
client-side abort. That header is now load-bearing, and the current conformance assertion is weaker
than the contract it is meant to protect:

```js
// tests/contract/src/specs/capabilities.spec.js
expect(cacheControl).toMatch(/max-age=86400/);
```

It never checks `public`, so an engine could silently drop that token and still pass. Several
documents also describe the frontend's old 5-second timeout and 10-minute memo, which TASK-23
invalidates.

## Decisions

### D1 — Assert `max-age` and `public` independently, never as a fixed string

Token order differs per engine: Spring emits `max-age=86400, public`, while api-dotnet, api-nodejs
and api-python emit `public, max-age=86400`. Two separate assertions against the lower-cased header
value, not one literal comparison — a fixed string would pass three engines and fail Java.

### D2 — No backend change

The header is already correct on all four engines; this task only stops it from regressing
unnoticed. If an engine fails the hardened assertion, report it rather than silently rewriting the
backend — that would be a contract finding, not a test fix.

### D3 — Document the timeout policy where each audience looks

- `docs/design/ui-vuejs.md` — the authoritative frontend description; §"Engine switching" and the
  capabilities-fallback prose both name the 5 s timeout and the 10-minute cache today.
- `ARCHITECTURE.md` — add the client-side budget to the request-flow narrative, which currently
  documents only the server-side 5 s and 15 s timeouts.
- `DEPLOYMENT.md` — the cold-start troubleshooting entry should note that the frontend no longer
  cancels the warm-up call, and keep `Always On` as the recommended fix.

### D4 — Record why the file cache was rejected

The measurement table in the plan is the only artefact that stops someone re-proposing a runtime
cache file. Link the plan from `docs/design/ui-vuejs.md`'s timeout section so the rationale is
reachable from the code's documentation, not just the plan directory.

### D5 — Leave historical records alone

`docs/plan/2026-07-25-*` and `docs/tasks/TASK-01`…`TASK-22` are point-in-time records. Do not
rewrite their timeout or cache references. This repo's established convention.

## Deliverables

| File | Change |
|---|---|
| `tests/contract/src/specs/capabilities.spec.js` | Split the `Cache-Control` assertion into independent `max-age=86400` and `public` checks against the lower-cased header. |
| `docs/design/ui-vuejs.md` | Replace the 5 s timeout / 10-minute cache prose with the new policy; link the plan. |
| `ARCHITECTURE.md` | Note the frontend's 15 s budget and the untimed capabilities call in the request-flow section. |
| `DEPLOYMENT.md` | Update the cold-start troubleshooting entry. |
| `CLAUDE.md` | Note the frontend timeout policy alongside the `/api/capabilities` description. |
| `docs/tasks/README.md` | Register TASK-23 and TASK-24 — status table, mermaid graph, wave list, file-ownership table. |

## Out of scope

- `ui-vuejs/**` (TASK-23).
- All four backends and `docs/open-api/**` — nothing in the contract moves, so the snapshots do not
  need regenerating.
- `docs/design/api-contract.md` — the 24-hour cacheability statement is already correct.

## Acceptance criteria

- [ ] The hardened assertion passes against all four backends
      (`BASE_URL=http://localhost:5000|5100|5200|5300`).
- [ ] The assertion fails if either token is removed — verify by temporarily editing one backend's
      header locally, then reverting.
- [ ] No live document still claims a 5-second capabilities timeout or a 10-minute frontend cache.
- [ ] Every relative link in every changed document resolves.
- [ ] `docs/tasks/README.md` lists TASK-23 and TASK-24 in all four places.
- [ ] Every server started during verification is killed.

## Report back

The conformance result per backend, and the list of documents changed.
