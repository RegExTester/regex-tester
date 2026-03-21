/**
 * RegExTesterOptions flags for JavaScript RegExp.
 *
 * Shared flags (same bitmask as .NET):
 *   IgnoreCase (1)  → 'i'
 *   Multiline  (2)  → 'm'
 *   Singleline (16) → 's' (dotAll)
 *
 * JS-specific flags:
 *   HasIndices  (2048)  → 'd'
 *   Global      (4096)  → 'g'
 *   Unicode     (8192)  → 'u'
 *   UnicodeSets (16384) → 'v'
 *   Sticky      (65536) → 'y'
 *
 * Custom:
 *   ShowCaptures (32768) — include capture arrays in response
 */

const FLAG_IGNORE_CASE     = 1;
const FLAG_MULTILINE       = 2;
const FLAG_SINGLELINE      = 16;
const FLAG_IGNORE_WHITESPACE = 32;
const FLAG_HAS_INDICES     = 2048;
const FLAG_GLOBAL          = 4096;
const FLAG_UNICODE         = 8192;
const FLAG_UNICODE_SETS    = 16384;
const FLAG_SHOW_CAPTURES   = 32768;
const FLAG_STICKY          = 65536;

const REGEX_TIMEOUT_MS = 15_000;

function buildFlags(options) {
  let flags = '';
  if (options & FLAG_GLOBAL)          flags += 'g';
  if (options & FLAG_HAS_INDICES)     flags += 'd';
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
   * @returns {{ error: string|null, replace: string|null, matches: object[]|null }}
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
      const hasIndices = !!(processedOptions & FLAG_HAS_INDICES);
      const isGlobal = !!(processedOptions & FLAG_GLOBAL);
      const regex = new RegExp(effectivePattern, flags);

      const inputText = text ?? '';
      const matches = [];

      // Timeout guard
      const deadline = Date.now() + REGEX_TIMEOUT_MS;

      if (isGlobal) {
        const iterator = inputText.matchAll(regex);
        for (const m of iterator) {
          if (Date.now() > deadline) {
            return {
              error: 'The regex match timed out (exceeded 15 seconds).',
              replace: null,
              matches: null,
            };
          }
          matches.push(buildMatchResult(m, showCaptures, hasIndices));
        }
      } else {
        const m = regex.exec(inputText);
        if (m) {
          matches.push(buildMatchResult(m, showCaptures, hasIndices));
        }
      }

      // Replace
      let replaceResult = null;
      if (replace != null) {
        const replaceRegex = new RegExp(effectivePattern, flags);
        replaceResult = inputText.replace(replaceRegex, replace);
      }

      return { error: null, replace: replaceResult, matches };
    } catch (err) {
      return { error: err.message, replace: null, matches: null };
    }
  }
}

function buildMatchResult(m, showCaptures, hasIndices) {
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
    if (groupValue != null && hasIndices && m.indices && m.indices[i]) {
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
