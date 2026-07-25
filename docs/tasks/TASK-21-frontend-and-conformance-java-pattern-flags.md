# TASK-21 — Frontend fallback config, conformance tests, and a spec repair

| | |
|---|---|
| **Phase** | 15 |
| **Depends on** | TASK-20 |
| **Blocks** | — |
| **Plan** | [docs/plan/2026-07-25-java-pattern-flags.md](../plan/2026-07-25-java-pattern-flags.md) |
| **Status** | Done |

## Context

`ui-vuejs` renders option checkboxes from `GET /api/capabilities`, so a new flag needs **no**
component change. It does need the bundled `config.java.js` fallback updated, because that file is
what the UI renders from before (or if) the capabilities call resolves — leaving it stale means the
new options flicker in, or never appear at all when the backend is unreachable.

Separately, discovery found `tests/contract/src/specs/capabilities.spec.js` is malformed (plan D5).
The `describe('GET /api/version (removed)')` block was spliced into the middle of the
`it('gives every option a power-of-two value')` callback, and that test's real body trails after the
block's closing `});`. It happens to parse, so nothing failed loudly — but the power-of-two
assertion is exactly the guard that validates a new bit allocation, so it must be repaired here.

## Decisions

### D1 — Repair `capabilities.spec.js` by restoring the intended structure

Close `it('gives every option a power-of-two value')` around its own body, and move
`describe('GET /api/version (removed)')` back out to the top level, after the main `describe`. No
assertion text changes — this is a structural repair, not a rewrite.

### D2 — Assert the new bits generically, not by hard-coded name

The suite runs against every engine with one shared set of specs, so it must not assert
"Java supports `Literal`". Instead:

- Every option value is a power of two, `> 0`, and `!== 128` — already intended, now actually running.
- No two options share a value, and no two share a name.
- Every option the engine reports `supported: true` for is honoured without error when set.

### D3 — Add one engine-agnostic behavioural test per new bit

For each of the four bits, POST a request with that bit set and assert HTTP 200 with a well-formed
body. On the engine that supports it the flag changes matching; on the other three it is ignored.
The assertion that holds everywhere is the contract's own rule: **an unsupported bit is never an
error**. Then, gated on `capabilities.options`, assert the *behavioural* effect only when the
running engine reports the bit as supported — which keeps one spec file correct on all four
backends.

### D4 — `config.java.js` lists the four new bits

Java's fallback grows from 6 to 10 entries. `DEFAULT_OPTIONS` stays `1 | 2`. The other three
`config.*.js` files are untouched — they must not list bits their engine reports unsupported
(TASK-16 D-list).

## Deliverables

| File | Change |
|---|---|
| `tests/contract/src/specs/capabilities.spec.js` | Structural repair per D1; add the duplicate-value and duplicate-name assertions from D2. |
| `tests/contract/src/specs/options.spec.js` | Add the four per-bit tests from D3. |
| `ui-vuejs/src/config.java.js` | Add `UnixLines`, `Literal`, `UnicodeCase`, `CanonicalEquivalence`. |

## Out of scope

- `ui-vuejs/src/components/RegexTester.vue` — capability-driven rendering already handles new flags.
- The other three `config.*.js` files.
- Any backend source (TASK-20).

## Acceptance criteria

- [ ] `capabilities.spec.js` has exactly two top-level `describe` blocks and no `describe` nested
      inside an `it`.
- [ ] The power-of-two test actually executes and passes on all four engines.
- [ ] The four new option tests pass against all four ports.
- [ ] Selecting Java in the UI shows ten checkboxes; the four new ones are present and functional.
- [ ] **Carried bits round trip**: set `CanonicalEquivalence` (2097152) on Java, switch to .NET and
      back, and confirm the bit survives in the URL.
- [ ] `npm run build-prod` succeeds.

## Report back

The repaired spec structure, and the pass count per port before and after.
