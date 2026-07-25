# TASK-10 — Frontend: hide unsupported options, drop the flag badge

| | |
|---|---|
| **Phase** | 5 |
| **Depends on** | TASK-09 |
| **Blocks** | — |
| **Plan** | [docs/plan/2026-07-25-api-contract-and-python-backend.md](../plan/2026-07-25-api-contract-and-python-backend.md) |
| **Status** | Not started |

## Context

TASK-07 made the option list capability-driven. It renders **every** flag in the contract registry and
greys out the ones the selected engine does not support. In practice that means the Python engine shows
18 checkboxes of which 12 are permanently disabled, and the .NET engine shows 6 dead rows. The disabled
entries are visual noise: a user cannot act on them, and the list is long enough that the useful options
get lost.

Each row is also prefixed with a `<code>` badge showing the engine-native flag (`i`, `m`, `IGNORECASE`,
`DOTALL`, `d`, `g`, …). This was intended as a learning aid but it adds a second vocabulary to every row,
misaligns the labels, and is inconsistent across engines — .NET supplies no flag strings at all, so its
list renders with no badges while Node.js and Python render a ragged mix.

Remove both.

**Only modify files under `ui-vuejs/`.**

## What changes

### 1. Hide unsupported options

In `src/components/RegexTester.vue`, `rebuildOptionsFromCapabilities()` currently maps every entry of the
capabilities `options` array and sets `disabled: !opt.supported`. Filter the array instead: only options
with `supported === true` are turned into rows.

Once unsupported options are never rendered, the `disabled` property, the `:disabled` binding and the
"Not supported by this engine" tooltip logic become dead. Remove them.

Keep the `title` attribute, but repurpose it: show `option.description` for **supported** options, so
hovering a checkbox still explains what the flag does. Fall back to no tooltip when the bundled offline
config is in use (it carries no descriptions).

### 2. Preserve unsupported bits across engine switches — do not silently drop them

This is the part that is easy to get wrong, so implement it deliberately.

`currentBitmask()` sums only the options currently rendered. If unsupported options are simply filtered
out, their bits vanish from the shareable URL the moment an engine that does not support them is selected.
A user who opens a Node.js link with `Unicode` (8192) set, flips to Python, then flips back to Node.js
would silently lose the flag — and the URL is the app's entire sharing mechanism.

Fix it: when rebuilding the option rows for an engine, capture the bits of the incoming bitmask that
belong to options this engine does **not** expose into a module-level "carried" value, and OR that value
back in wherever the outgoing bitmask is computed (both the `POST /api/regex` body and the router URL).

This is safe and contract-compliant: unsupported bits are, by contract, silently ignored by every backend
and are never an error.

Recompute the carried value on every engine switch. Do not let it accumulate stale bits across
several switches — it must always be derived from the current bitmask and the current engine's option
list, never appended to.

### 3. Remove the flag badge

- Delete the `<code v-if="option.flag" class="option-flag">{{ option.flag }}</code>` element from **both**
  the desktop options sidebar and the mobile options block.
- Stop populating `flag` in `rebuildOptions()` and `rebuildOptionsFromCapabilities()` if nothing else
  consumes it.
- Delete the now-unused `code.option-flag` rule from `ui-vuejs/src/styles.css`.
- Do **not** remove `flag` from the API contract or from any backend's capabilities response — the field
  stays in the contract, the frontend just stops rendering it.

### 4. Keep both layouts in sync

The desktop sidebar and the mobile block render the same list twice, in two separate template blocks.
Every change above must be applied to both.

## Out of scope

- Any backend change.
- Any change to `docs/open-api/regex-tester-api.v1.yaml` or `docs/design/api-contract.md`.
- Removing the `flag` or `supported` fields from the capabilities response.
- Restyling or reordering the option list beyond removing the badge.

## Acceptance criteria

- [ ] With the Python engine selected, only the options Python actually supports are rendered
      (`IgnoreCase`, `Multiline`, `Singleline`, `IgnorePatternWhitespace`, `ShowCaptures`, `Ascii`) — no
      disabled rows.
- [ ] With the .NET engine selected, `HasIndices`, `Global`, `Unicode`, `UnicodeSets`, `Sticky` and `Ascii`
      are absent from the list.
- [ ] With the Node.js engine selected, `ExplicitCapture`, `Compiled`, `RightToLeft`, `ECMAScript`,
      `CultureInvariant` and `NonBacktracking` are absent from the list.
- [ ] No `<code class="option-flag">` badge is rendered for any engine, and the CSS rule is gone.
- [ ] No `disabled` checkbox appears in the options list for any engine.
- [ ] Hovering a supported option shows its description as a tooltip when capabilities are available.
- [ ] Opening `/{pattern}/{text}/8192/1` (Node.js, `Unicode` set), switching to Python, then switching back
      to Node.js leaves the `Unicode` checkbox checked and `8192` still present in the URL bitmask.
- [ ] The mobile and desktop option lists render identically.
- [ ] `npm.cmd run build` and `npm.cmd run build-prod` both succeed.
- [ ] With `/api/capabilities` unreachable, the app still renders the bundled fallback option list and the
      engine tooltip reads `offline`.

## Report back

List every file modified; describe exactly how the carried-bits mechanism is implemented and where it is
OR-ed back in; confirm the engine-switch round-trip test above; and note any acceptance criterion you could
not satisfy, with the reason.
