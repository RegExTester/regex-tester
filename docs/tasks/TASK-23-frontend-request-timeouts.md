# TASK-23 — Frontend request-timeout policy

| | |
|---|---|
| **Phase** | 16 |
| **Depends on** | — |
| **Blocks** | TASK-24 |
| **Plan** | [docs/plan/2026-07-26-frontend-request-timeouts.md](../plan/2026-07-26-frontend-request-timeouts.md) |
| **Status** | Done |

## Context

[ui-vuejs/src/components/RegexTester.vue](../../ui-vuejs/src/components/RegexTester.vue) aborts
`GET /api/capabilities` after 5 seconds (`CAPABILITIES_FETCH_TIMEOUT`) and shows `offline`. A cold
Azure App Service instance routinely needs longer than that to serve its first byte, so the warm-up
request is cancelled before the instance it is waking up can answer. Meanwhile `POST /api/regex` has
no client timeout at all — the timeout policy is exactly inverted.

No backend work is involved. The plan's benchmarks established that the server-side handler is not
the bottleneck, and all four backends already send `Cache-Control` for 24 hours.

## Decisions

### D1 — Remove the client timeout from `GET /api/capabilities`

This is the warm-up call; aborting it is counter-productive. Call `fetch` directly with no
`AbortController`. The engine icon stays in its `Loading...` state while the request is outstanding
rather than falsely reporting `offline` at 5 s.

A genuinely unreachable host still rejects — DNS failure, connection refused and the browser's own
network timeout all reject the promise — so the existing `.catch(() => engine.value = 'offline')`
fallback and the bundled option list are unchanged. Do not delete that fallback.

### D2 — 15-second timeout on every other API call

Replace `CAPABILITIES_FETCH_TIMEOUT = 5000` with `API_REQUEST_TIMEOUT = 15000` and apply it to
`POST /api/regex` in `submit()`. Keep the `fetchWithTimeout(url, ms)` helper — retarget it, do not
delete it — and add the `RequestInit` argument it needs to carry the POST method, headers and body
alongside the abort signal. Its existing `.finally(() => clearTimeout(timer))` must survive, or the
timer leaks on every request.

15 s sits well clear of the backends' own 5 s request timeout, which returns HTTP 200 with an
`error` body rather than hanging. The client abort therefore only fires when the transport is stuck,
never when the server is merely slow at regex.

### D3 — Align the in-memory capabilities memo to 24 hours

`CAPABILITIES_CACHE_TTL` moves from `10 * 60 * 1000` to 24 hours, matching the `max-age=86400` the
servers already send. Two different lifetimes for one immutable-per-deployment document is a trap
for the next reader. Leave the `fetch` cache mode at its default so the browser HTTP cache keeps
honouring the server header.

### D4 — Report a timeout distinctly from an outage

`submit()`'s `.catch` currently renders `Error: Cannot contact the API.` for every rejection. Branch
on `err?.name === 'AbortError'` and render a message naming the 15-second budget instead, so a
stuck transport is not misdiagnosed as an outage. `busy.value = false` must still be cleared on
both paths.

### D5 — Do not touch the debounce

`CONFIG.DELAY_TIME` (800 ms) and `delaySubmit()` are unrelated to request timeouts and stay as they
are.

## Deliverables

| File | Change |
|---|---|
| `ui-vuejs/src/components/RegexTester.vue` | `API_REQUEST_TIMEOUT = 15000` replacing `CAPABILITIES_FETCH_TIMEOUT`; `fetchWithTimeout(url, options, ms)` gains a `RequestInit` parameter; `fetchCapabilities()` uses a bare `fetch`; `submit()` uses `fetchWithTimeout`; `CAPABILITIES_CACHE_TTL` = 24 h; `AbortError` branch in `submit()`'s catch. |

## Out of scope

- All four backends — no change (plan D1, D6). Do not add a runtime cache file.
- `Cache-Control` headers — already 24 hours on every engine.
- `docs/**`, `ARCHITECTURE.md`, `tests/contract/**` (TASK-24).
- Adding `Always On` to App Service — infrastructure, tracked as a follow-up in the plan.

## Acceptance criteria

- [ ] No reference to `CAPABILITIES_FETCH_TIMEOUT` remains anywhere in `ui-vuejs/`.
- [ ] `GET /api/capabilities` is issued with no `AbortController` and no `signal`.
- [ ] `POST /api/regex` aborts at 15 s and renders a timeout-specific message, not
      `Cannot contact the API.`
- [ ] `busy` is cleared on the abort path.
- [ ] The `clearTimeout` cleanup still runs on both success and failure.
- [ ] A backend stopped mid-session still yields `offline` and the bundled option list.
- [ ] `npm run build` succeeds in `ui-vuejs/`.
- [ ] Manually verified against all four engines: a cold/slow `/api/capabilities` resolves to the
      real `runtime.framework` string instead of flipping to `offline`.

## Report back

The frontend build result, and the observed behaviour on a deliberately slow and a deliberately
stopped backend.
