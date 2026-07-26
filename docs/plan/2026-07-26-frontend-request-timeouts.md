# Plan — Frontend request-timeout policy for cold backends

| | |
|---|---|
| **Date** | 2026-07-26 |
| **Status** | Implemented |
| **Goal** | Stop the frontend cancelling `GET /api/capabilities` while a backend is still waking up: remove the client timeout on that call, lean on its existing 24-hour HTTP cache, and apply a 15-second timeout to every other API call. |

## Context

Users report `GET /api/capabilities` being "super slow", especially on the first request after an
idle period. The frontend calls it on load and on every engine switch (`warmUpApiServer()` in
[ui-vuejs/src/components/RegexTester.vue](../../ui-vuejs/src/components/RegexTester.vue)).

### The server-side handler is not the problem — measured, not assumed

An earlier revision of this plan proposed persisting the `runtime` (`os`, `framework`) probe to a
local cache file on each server. That idea was **benchmarked and rejected**: reading a cache file is
hundreds to thousands of times *more* expensive than the probe it would replace, because every one
of the four runtimes already memoises the underlying value.

| Backend | `os` probe | `framework` probe | Total probe | File read + parse | File cache is |
|---|---|---|---|---|---|
| api-dotnet | 3.9 ns | 1.5 ns | **5.4 ns** | 46,007 ns | 8,500× slower |
| api-nodejs | 28.6 ns | 12.5 ns | **41 ns** | 41,679 ns | 1,000× slower |
| api-python | 170.1 ns | 89.0 ns | **259 ns** | 77,755 ns | 300× slower |
| api-java | 49.4 ns | 17.3 ns | **67 ns** | 42,043 ns | 630× slower |

Why they are already cheap:

- **api-dotnet** — `RuntimeInformation.OSDescription` / `FrameworkDescription` are lazily computed
  into `static` fields; 3.9 ns and 1.5 ns are field reads, not syscalls.
- **api-python** — `platform.uname()` is memoised in `platform._uname_cache` (verified `True`);
  `python_version()` derives from `sys.version_info`.
- **api-java** — system properties are a `Properties` map populated at JVM init; `getProperty` is a
  hash lookup.
- **api-nodejs** — `os.type()` / `os.release()` do call `uv_os_uname()` per invocation, the only
  real syscall in the set, but 41 ns for the whole block is irrelevant.

The entire `runtime` block costs under 0.3 µs on the worst engine. It is not a measurable fraction
of a request that takes seconds.

### The real cause is Azure App Service cold start, and the frontend guarantees the failure

The apps are unloaded after idle, so the first request pays a full runtime boot — already documented
in [DEPLOYMENT.md](../../DEPLOYMENT.md). But the client currently aborts before the instance
finishes booting: `CAPABILITIES_FETCH_TIMEOUT = 5000` cancels the fetch at 5 seconds and flips the
engine indicator to `offline`. The request most likely to be cancelled is precisely the one that
would have woken the backend.

### Current frontend behaviour

| Call | Client timeout | Caching |
|---|---|---|
| `GET /api/capabilities` | 5 s, via `fetchWithTimeout` + `AbortController` | 10-minute in-memory memo per engine; server sends `Cache-Control: public, max-age=86400` |
| `POST /api/regex` | none | none |

Every backend already serves the capability document with a 24-hour `Cache-Control`, so no backend
change is needed to get durable caching — only the client-side abort has to go.

## Decisions

### D1 — Do not cache the runtime probe to a file; leave all four backends untouched

Rejected on the measurements above. It would make the endpoint slower, introduce a stale-data
failure mode after an OS or framework upgrade, and create a response-injection surface (a
predictable temp path whose contents are echoed to every API client).

### D2 — No client-side timeout on `GET /api/capabilities`

This is the warm-up call. Aborting it is strictly counter-productive: the user gets `offline`, and
the next attempt starts a cold boot again. Removing the abort lets the fetch ride out the boot and
the engine indicator resolves to the real framework string.

The engine icon therefore stays in its `Loading...` spinner state for as long as the request is
outstanding, instead of falsely reporting `offline` at 5 s. A genuinely unreachable host still
rejects — DNS failure, connection refused and the browser's own network timeout all reject the
promise and drive the existing `offline` fallback. "No timeout" means no *application* timeout, not
an unbounded hang.

*Rejected: raising the timeout to 30 s.* Any fixed number is a guess at cold-start duration, and
whatever it is, exceeding it produces the same counter-productive cancellation.

### D3 — 15-second timeout on every other API call

`POST /api/regex` has no client timeout today. Give it 15 s, and structure the code so any future
non-capabilities call gets the same budget by default.

15 s is well clear of the backends' own 5 s request timeout — which already returns HTTP 200 with an
`error` body rather than hanging — so the client abort only fires when the *transport* is stuck,
never when the server is merely slow at regex.

### D4 — Rely on the existing 24-hour HTTP cache; align the in-memory memo to match

No backend change: all four already send a 24-hour `Cache-Control` on the capability document. The
frontend's `fetch` uses the default cache mode, so the browser HTTP cache honours it automatically
and a repeat visit within 24 hours never touches the network.

The in-memory `capabilitiesCache` TTL moves from 10 minutes to 24 hours so the two layers agree. Two
different lifetimes for one immutable-per-deployment document is a trap for the next reader.

*Note for the implementer:* the header's token order differs per engine — Spring emits
`max-age=86400, public` while the other three emit `public, max-age=86400`. Any assertion must check
the two tokens independently rather than match a fixed string.

### D5 — A timed-out request must not be reported as "cannot contact the API"

`submit()`'s catch-all currently renders `Error: Cannot contact the API.` for every rejection. With
D3 introducing a deliberate abort, distinguish it: an `AbortError` gets its own message naming the
15-second budget, so a slow-transport case is not misdiagnosed as an outage.

### D6 — No contract change, no backend change, no OpenAPI change

The response shape, status codes, limits, flags and cache headers are all untouched. This is a
frontend-only behavioural change plus documentation.

## Breaking changes

None. No API surface moves. The only user-visible change is that the engine indicator now waits for
a cold backend instead of declaring it offline after 5 seconds.

## Out of scope / follow-up

**Enabling App Service `Always On`** would remove idle unload altogether and is the true root-cause
fix; the `S1` plan supports it. Deliberately not bundled here — it is an infrastructure change, not a
code change, and this plan makes the frontend behave correctly whether or not it happens.

## Task breakdown

| Task | Scope |
|---|---|
| TASK-23 | Frontend request-timeout policy |
| TASK-24 | Conformance assertion hardening and documentation |
