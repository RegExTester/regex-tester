/**
 * RegExTesterOptions flags for JavaScript RegExp.
 *
 * Shared flags (same bitmask as .NET):
 *   IgnoreCase (1)  → 'i'
 *   Multiline  (2)  → 'm'
 *   Singleline (16) → 's' (dotAll)
 *
 * JS-specific flags:
 *   HasIndices  (2048)  → 'd' (always applied internally, see buildFlags())
 *   Global      (4096)  → 'g' (always applied internally, see buildFlags())
 *   Unicode     (8192)  → 'u'
 *   UnicodeSets (16384) → 'v'
 *   Sticky      (65536) → 'y'
 *
 * Custom:
 *   ShowCaptures (32768) — include capture arrays in response
 *
 * Global/HasIndices vs. the contract: `POST /api/regex` MUST return every non-overlapping match
 * and MUST always report index/length data, regardless of which option bits the caller sets —
 * otherwise the same shared URL would produce a different number of matches on different engines.
 * So `g` and `d` are applied unconditionally below; the `Global`/`HasIndices` option bits are kept
 * in `/api/capabilities` purely so the frontend can still display/toggle them, but they are true
 * no-ops for match extraction. `Sticky` (`y`) is NOT forced — unlike `g`/`d` it changes *where* a
 * match is allowed to start, so honouring the caller's choice there is a real behavioural
 * difference, not a presentation detail. `y` combines safely with the always-on `g`: `matchAll`
 * only requires `g` to be present, and a sticky regex simply fails to match (ending iteration)
 * as soon as no match starts exactly at the current `lastIndex` — it cannot cause an infinite
 * loop, it just means fewer matches are returned once the sticky anchor stops lining up.
 */

const FLAG_IGNORE_CASE     = 1;
const FLAG_MULTILINE       = 2;
const FLAG_SINGLELINE      = 16;
const FLAG_IGNORE_WHITESPACE = 32;
const FLAG_UNICODE         = 8192;
const FLAG_UNICODE_SETS    = 16384;
const FLAG_SHOW_CAPTURES   = 32768;
const FLAG_STICKY          = 65536;

const REGEX_TIMEOUT_MS = 15_000;

function buildFlags(options) {
  // `g` and `d` are always applied internally — see the file-level comment above.
  let flags = 'gd';
  if (options & FLAG_IGNORE_CASE)     flags += 'i';
  if (options & FLAG_MULTILINE)       flags += 'm';
  if (options & FLAG_SINGLELINE)      flags += 's';
  if (options & FLAG_UNICODE)         flags += 'u';
  if (options & FLAG_UNICODE_SETS)    flags += 'v';
  if (options & FLAG_STICKY)          flags += 'y';
  return flags;
}

function stripComments(pattern) {
  return pattern
    .replace(/(\\.)|(#[^\n]*)|(\s+)/g, (m, escaped) => escaped || '');
}

export class RegexProcessor {
  /**
   * @param {string|null} pattern
   * @param {string|null} text
   * @param {string|null} replace
   * @param {number} options - bitwise flags
   * @returns {{ error: string|null, replace: string|null, matches: object[] }}
   */
  static match(pattern, text, replace, options) {
    if (!pattern) {
      return { error: null, replace: null, matches: [] };
    }

    const showCaptures = !!(options & FLAG_SHOW_CAPTURES);
    const processedOptions = options & ~FLAG_SHOW_CAPTURES;

    try {
      let effectivePattern = pattern;
      if (processedOptions & FLAG_IGNORE_WHITESPACE) {
        effectivePattern = stripComments(pattern);
      }

      const flags = buildFlags(processedOptions);
      const regex = new RegExp(effectivePattern, flags);

      const inputText = text ?? '';
      const matches = [];

      // Timeout guard
      const deadline = Date.now() + REGEX_TIMEOUT_MS;

      // `flags` always includes `g` (see buildFlags()), so this returns every non-overlapping
      // match regardless of the caller's Global option bit. The spec-defined matchAll iterator
      // already advances past zero-length matches by one code unit (ECMA-262
      // "AdvanceStringIndex"), so a pattern like `a*` cannot spin forever on its own; the
      // deadline check below additionally guards against merely-slow (catastrophic backtracking)
      // patterns.
      const iterator = inputText.matchAll(regex);
      for (const m of iterator) {
        if (Date.now() > deadline) {
          return {
            error: 'The regex match timed out (exceeded 15 seconds).',
            replace: null,
            matches: [],
          };
        }
        matches.push(buildMatchResult(m, showCaptures));
      }

      // Replace
      let replaceResult = null;
      if (replace != null) {
        // `flags` includes `g`, so every match is replaced — matching .NET's `Regex.Replace`
        // default (replace-all) rather than JS `String.replace`'s default (first-match-only).
        const replaceRegex = new RegExp(effectivePattern, flags);
        replaceResult = inputText.replace(replaceRegex, replace);
      }

      return { error: null, replace: replaceResult, matches };
    } catch (err) {
      return { error: err.message, replace: null, matches: [] };
    }
  }
}

function buildMatchResult(m, showCaptures) {
  const matchResult = {
    name: '0',
    index: m.index,
    length: m[0].length,
    value: m[0],
    groups: [],
    captures: showCaptures
      ? [{ index: m.index, length: m[0].length, value: m[0] }]
      : null,
  };

  for (let i = 1; i < m.length; i++) {
    const groupValue = m[i] ?? null;
    let groupName = String(i);
    if (m.groups) {
      for (const [name, val] of Object.entries(m.groups)) {
        if (val === groupValue && name !== String(i)) {
          groupName = name;
          break;
        }
      }
    }

    let groupIndex = 0;
    let groupLength = 0;
    // `d` is always applied internally (see buildFlags()), so `m.indices` is always present.
    if (groupValue != null && m.indices && m.indices[i]) {
      groupIndex = m.indices[i][0];
      groupLength = m.indices[i][1] - m.indices[i][0];
    }

    matchResult.groups.push({
      name: groupName,
      index: groupIndex,
      length: groupLength,
      value: groupValue,
      captures: showCaptures && groupValue != null
        ? [{ index: groupIndex, length: groupLength, value: groupValue }]
        : null,
    });
  }

  return matchResult;
}
