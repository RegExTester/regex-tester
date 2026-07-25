# TASK-20 — Backends: implement the four new option bits

| | |
|---|---|
| **Phase** | 14 |
| **Depends on** | TASK-19 |
| **Blocks** | TASK-21, TASK-22 |
| **Plan** | [docs/plan/2026-07-25-java-pattern-flags.md](../plan/2026-07-25-java-pattern-flags.md) |
| **Status** | Done |

## Context

Every backend ships the full contract registry in `GET /api/capabilities`, including bits it does
not implement, so the frontend can render them as disabled rather than omit them. The four bits
allocated by TASK-19 must therefore appear in **all four** registries — supported in Java, listed
and ignored in the other three.

## Decisions

### D1 — api-java is the only engine that maps them to a real flag

```
UNIX_LINES  (262144)  -> Pattern.UNIX_LINES
LITERAL     (524288)  -> Pattern.LITERAL
UNICODE_CASE(1048576) -> Pattern.UNICODE_CASE
CANON_EQ    (2097152) -> Pattern.CANON_EQ
```

`SUPPORTED_PATTERN_FLAGS` grows from 5 to 9 entries. `Map.of` accepts at most 10 key/value pairs,
so it still fits — but the next flag added will overflow it and must switch to `Map.ofEntries`.

### D2 — The other three list them `supported: false`, `flag: null`

Exactly as they already do for `Ascii`, `Sticky` and `NonBacktracking`. Setting the bit is a
silent no-op; it must never be rejected (contract §4).

Each description states the flag's real behaviour first, then why this engine ignores it. Where an
engine's default already *is* the flag's behaviour, say so explicitly rather than using the generic
"Not supported by this engine" boilerplate — for `UnixLines` on .NET and Python, `\n` is already the
only line terminator, so there is genuinely nothing to opt into. Node.js is **not** in that group:
JavaScript also honours `\r`, `\u2028` and `\u2029` but exposes no flag to restrict them, so its
description must say the bit is ignored for want of an equivalent, not that the behaviour matches.

### D3 — `defaultOptions` does not change on any engine

The new bits stay clear by default. The conformance suite asserts
`defaultOptions & ~supportedMask === 0`, which continues to hold.

### D4 — No change to any regex processor

The bitmask → engine-flag translation lives entirely in the options module of each backend
(`RegExTesterOptions.cs`, `capabilities.js`, `options.py`, `RegexOptions.java`). `RegexProcessor`
calls into it and needs no edit. `ShowCaptures` remains the only bit stripped before execution.

## Deliverables

| File | Change |
|---|---|
| `api-java/src/main/java/io/github/regextester/api/options/RegexOptions.java` | Four `public static final int` constants; four entries in `SUPPORTED_PATTERN_FLAGS`; four `CapabilityOption`s with `supported: true` and the native constant name in `flag`. |
| `api-dotnet/Models/RegExTesterOptions.cs` | Four `CapabilityOption` entries, `Supported = false`, `Flag = null`. The `RegExTesterOptions` enum itself is **not** extended — it mirrors `System.Text.RegularExpressions.RegexOptions`, and these bits have no .NET counterpart. |
| `api-nodejs/src/services/capabilities.js` | Four `OPTION_REGISTRY` entries, `supported: false`, `flag: null`. |
| `api-python/src/options.py` | Four `FLAG_*` constants and four `OPTION_REGISTRY` entries, `supported: False`, `flag: None`. Not added to `SUPPORTED_RE_FLAGS`. |

## Out of scope

- `tests/contract/**` and `ui-vuejs/**` (TASK-21).
- `api-*/ARCHITECTURE.md` and `docs/**` (TASK-22).
- Any regex processor (D4).

## Acceptance criteria

- [ ] All four registries list 21 options, in ascending value order, none with value `128`.
- [ ] `GET /api/capabilities` on 5300 reports all four as `supported: true` with `flag` set to the
      native constant name; on 5000, 5100 and 5200 all four are `supported: false` with `flag: null`.
- [ ] `POST /api/regex` on port 5300 with `options: 524288` (`Literal`) and pattern `a.c` matches
      the literal text `a.c` and does **not** match `abc`.
- [ ] `POST /api/regex` on port 5300 with `options: 2097152` (`CanonicalEquivalence`) and pattern
      `\u00E5` matches the text `a\u030A`.
- [ ] The same requests against 5000, 5100 and 5200 are accepted and behave exactly as if the bit
      were clear — HTTP 200, no error.
- [ ] `dotnet build` is clean with no new warnings; `mvn package` succeeds.
- [ ] The conformance suite still passes against all four ports.

## Report back

The `/api/capabilities` diff per engine, and the observed behaviour of the `Literal` and
`CanonicalEquivalence` probes on 5300.
