# Plan — expose the remaining `java.util.regex.Pattern` flags

| | |
|---|---|
| **Date** | 2026-07-25 |
| **Status** | Proposed |
| **Goal** | Close the gap between the shared option registry and the native option sets of the four engines by allocating bits for the four `java.util.regex.Pattern` flags that currently have no representation. |

## 1. Context

The shared option bitmask (`docs/design/api-contract.md` §3) currently allocates 17 bits, `1`
through `131072`, skipping the permanently reserved `128`. An audit of each engine's *native*
option set against that registry found the following.

### Coverage per engine, today

| Engine | Native options | In the registry | Missing |
|---|---|---|---|
| .NET `RegexOptions` | 11 public values | 11 | **none** (`Debug` = 128 is `internal` and permanently reserved) |
| Node.js `RegExp` flags | 8 (`d g i m s u v y`) | 8 | **none** |
| Python `re` | 7 usable | 5 | `re.LOCALE`, `re.DEBUG` |
| Java `Pattern` | 9 | 5 | `UNIX_LINES`, `LITERAL`, `UNICODE_CASE`, `CANON_EQ` |

The registry is therefore complete for .NET and Node.js, and materially incomplete for Java, which
exposes only 5 of its 9 flags. That is the largest gap and the one worth closing.

### Java flags with no bit

| `Pattern` constant | Value | Effect |
|---|---|---|
| `UNIX_LINES` | `0x01` | Only `\n` is a line terminator for `^`, `$` and `.` — excludes `\r\n`, `\r`, `\u0085`, `\u2028`, `\u2029` |
| `LITERAL` | `0x10` | The pattern is matched as a literal string; all metacharacters lose their meaning |
| `UNICODE_CASE` | `0x40` | Case-insensitive matching folds according to the Unicode standard rather than US-ASCII |
| `CANON_EQ` | `0x80` | Two characters match when their full canonical decompositions are equal (`a\u030A` matches `\u00E5`) |

### Python flags with no bit

| `re` constant | Value | Why it has no bit |
|---|---|---|
| `re.LOCALE` | `4` | Raises `ValueError: cannot use LOCALE flag with a str pattern`. This API only ever compiles `str` patterns, so the flag can never be honoured. |
| `re.DEBUG` | `128` | Writes the compiled pattern's parse tree to the **server's** stdout. It changes nothing in the response, so a client could never observe it; it would only pollute server logs. |

## 2. Decisions

### D1 — Allocate four new bits, for the four Java flags only

| Value | Name | Native mapping |
|---|---|---|
| `262144` (2^18) | `UnixLines` | Java `UNIX_LINES` |
| `524288` (2^19) | `Literal` | Java `LITERAL` |
| `1048576` (2^20) | `UnicodeCase` | Java `UNICODE_CASE` |
| `2097152` (2^21) | `CanonicalEquivalence` | Java `CANON_EQ` |

New flags take the next free powers of two after the highest allocated value (`131072`), per §3 of
the contract. All four remain inside `int32`, which the `options` field requires.

Names follow the registry's existing spelled-out PascalCase style (`IgnorePatternWhitespace`,
`UnicodeSets`), not the engine-native abbreviation — hence `CanonicalEquivalence`, not `CanonEq`.
The engine-native spelling is carried in each option's `flag` field, which is exactly what that
field is for.

**Rejected:** reusing `128` for `UnixLines`. The contract states `128` is *permanently* reserved;
re-allocating it would break any client that still treats it as .NET's `Debug` bit.

### D2 — Do not allocate bits for `re.LOCALE` or `re.DEBUG`

Neither can ever be `supported: true` on any engine:

- `re.LOCALE` is rejected by Python itself for `str` patterns. A bit that always no-ops on all four
  engines is pure noise in the capabilities payload and a permanently disabled checkbox in the UI.
- `re.DEBUG` produces server-side output only, so it is unobservable through the API — and the
  concept already owns the reserved bit `128`.

**Rejected alternative:** listing them with `supported: false` everywhere "for completeness". The
registry's purpose is to describe what a client can *ask for*, not to be an exhaustive union of
every constant in four standard libraries. §7 of the contract is the right place to record the
omission, and this plan records the reasoning.

### D3 — Java is the only engine that supports the new bits

.NET, Node.js and Python have no native equivalent for any of the four:

- **`UnixLines`** — .NET and Python already treat `\n` as the only line terminator for `^`/`$`, so
  the flag would be a no-op there even if it existed. JavaScript is **not** `\n`-only — ECMAScript's
  LineTerminator set also includes `\r`, `\u2028` and `\u2029` — but it exposes no flag to restrict
  that, so the bit is ignored on Node.js and that engine stays divergent. Verified empirically:
  `^b` against `"a\rb"` with `Multiline` yields 1 match on Node.js and 0 on .NET/Python; Java yields
  1 without the bit and 0 with it.
- **`Literal`** — the other three escape a pattern at the call site (`Regex.Escape`, `re.escape`)
  rather than via a compile flag.
- **`UnicodeCase`** — .NET and Python already case-fold with Unicode semantics by default; JS does
  so under `u`/`v`. Only Java defaults to ASCII folding and needs an opt-in.
- **`CanonicalEquivalence`** — genuinely unique to Java; no other engine of the four offers it.

Each therefore appears in the other three registries with `supported: false` and `flag: null`, and
setting the bit there is silently ignored — the standard treatment already applied to `Ascii`
(Python-only), `Sticky` (Node-only) and `NonBacktracking` (.NET-only). Single-engine flags are the
norm in this registry, not an exception.

### D4 — `UnicodeCase` overlaps `Unicode` (8192), and that is documented, not resolved

Java's `UNICODE_CHARACTER_CLASS` — which bit `8192` (`Unicode`) already maps to — implies
`UNICODE_CASE`. So setting `Unicode` continues to enable Unicode case folding as a side effect.
The new bit adds the ability to request Unicode case folding **without** making `\w`, `\d`, `\s`
and `\b` Unicode-aware, which is otherwise unreachable.

This is a genuine behavioural overlap, so it goes in §7 "Known engine divergences" rather than
being papered over.

### D5 — Fix `tests/contract/src/specs/capabilities.spec.js` in the same change

Discovery found the file is malformed: the `describe('GET /api/version (removed)')` block sits
*inside* the callback of `it('gives every option a power-of-two value')`, and the statements that
should form that test's body trail after the block's closing `});`. It parses as valid JavaScript,
which is why it went unnoticed, but the `/api/version` suite is registered at test-run time instead
of collection time and the power-of-two assertion never runs against a real payload.

That is precisely the assertion that guards new bit allocations, so it must be repaired before this
change can claim to be verified.

## 3. Breaking-change assessment

**None.** The change is purely additive:

- No existing bit changes value, name or meaning.
- Clients that never set the new bits are unaffected.
- Clients that *do* set them get the documented no-op on three engines, which §4 of the contract
  already mandates for unknown bits — so even a backend that has not yet shipped this change
  behaves correctly when it receives them.
- `defaultOptions` is unchanged on every engine, so the frontend's initial state does not move.
- Shared URLs keep working in both directions: an old URL has the new bits clear, and a new URL's
  extra bits survive an engine switch through the frontend's carried-bits mechanism.

## 4. Task breakdown

| Task | Scope |
|---|---|
| TASK-19 | Contract: `docs/design/api-contract.md` §3 + §7, `CLAUDE.md` flag table |
| TASK-20 | All four backend option registries; Java also gains the real `Pattern` mapping |
| TASK-21 | `ui-vuejs` bundled fallback config for Java, plus conformance tests and the D5 repair |
| TASK-22 | Per-engine design docs, `api-*/ARCHITECTURE.md`, regenerated OpenAPI snapshots |

TASK-19 runs first — contract before implementation. TASK-20 follows. TASK-21 and TASK-22 own
disjoint paths and run in parallel afterwards.
