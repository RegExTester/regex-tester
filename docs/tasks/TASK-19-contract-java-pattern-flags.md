# TASK-19 — Contract: allocate four new option bits for Java's `Pattern` flags

| | |
|---|---|
| **Phase** | 13 |
| **Depends on** | — |
| **Blocks** | TASK-20 |
| **Plan** | [docs/plan/2026-07-25-java-pattern-flags.md](../plan/2026-07-25-java-pattern-flags.md) |
| **Status** | Done |

## Context

The shared option registry allocates 17 bits (`1`–`131072`, skipping the reserved `128`). It covers
every public .NET `RegexOptions` value and every JavaScript `RegExp` flag, but only 5 of Java's 9
`java.util.regex.Pattern` flags. This task allocates the four missing bits in the canonical
contract, **before** any backend implements them.

## Decisions

### D1 — Values and names

| Value | Name | Java `Pattern` constant |
|---|---|---|
| `262144` | `UnixLines` | `UNIX_LINES` |
| `524288` | `Literal` | `LITERAL` |
| `1048576` | `UnicodeCase` | `UNICODE_CASE` |
| `2097152` | `CanonicalEquivalence` | `CANON_EQ` |

Next free powers of two after `131072`. `128` stays permanently reserved and must not be touched.
Names use the registry's spelled-out PascalCase style; the native spelling belongs in each option's
`flag` field.

### D2 — Java-only

All four are `—` for .NET, Node.js and Python in the §3 table. See plan D3 for why none of the
other three has a native equivalent.

### D3 — Record the `UnicodeCase` / `Unicode` overlap as a divergence

Java's `UNICODE_CHARACTER_CLASS` (bit `8192`) implies `UNICODE_CASE`, so bit `8192` already enables
Unicode case folding as a side effect. Bit `1048576` exists to request that folding *without*
making `\w`, `\d`, `\s` and `\b` Unicode-aware. This overlap goes in §7, not hidden.

### D4 — No OpenAPI schema change

`docs/open-api/regex-tester-api.v1.yaml` describes `options` as an `int32` and `CapabilityOption`
generically; it does not enumerate flag values. Adding bits therefore requires **no** schema edit.
Do not add an `enum` — that would make every future flag a breaking schema change.

## Deliverables

| File | Change |
|---|---|
| `docs/design/api-contract.md` | §3: append four rows to the flag registry table. §7: add a "Known engine divergences" row for the `UnicodeCase` / `Unicode` overlap, and a note that `re.LOCALE` and `re.DEBUG` are deliberately unallocated (plan D2). |
| `CLAUDE.md` | Append the four rows to the "Regex Options (bitwise flags)" table; extend the api-java prose paragraph beneath it. |

## Out of scope

- `docs/open-api/regex-tester-api.v1.yaml` (D4).
- Any backend source (TASK-20).
- `docs/plan/**` and `docs/tasks/TASK-01`…`TASK-18` — historical records, never retro-edited.

## Acceptance criteria

- [ ] §3's table lists 21 flags plus the reserved `128` row, in ascending value order.
- [ ] Every new value is a power of two, greater than `131072`, and within `int32`.
- [ ] `CLAUDE.md`'s table matches §3 row for row.
- [ ] §7 documents the `UnicodeCase` overlap and the two deliberate Python omissions.
- [ ] Every relative link in both files still resolves.

## Report back

The four rows as written, and the §7 wording.
