/**
 * RegExTesterOptions flags (mirrored from .NET API).
 *
 * Supported in JS:
 *   IgnoreCase (1)  → 'i'
 *   Multiline  (2)  → 'm'
 *   Singleline (16) → 's' (dotAll)
 *
 * Acknowledged but no-op in JS (behaviour is default or N/A):
 *   ExplicitCapture (4), Compiled (8), IgnorePatternWhitespace (32),
 *   RightToLeft (64), ECMAScript (256), CultureInvariant (512),
 *   NonBacktracking (1024)
 *
 * Custom:
 *   ShowCaptures (32768) — include capture arrays in response
 */

const SHOW_CAPTURES = 32768;
const REGEX_TIMEOUT_MS = 15_000;

function buildFlags(options) {
  let flags = 'g'; // always global to find all matches
  if (options & 1)  flags += 'i'; // IgnoreCase
  if (options & 2)  flags += 'm'; // Multiline
  if (options & 16) flags += 's'; // Singleline (dotAll)
  // 'd' flag enables indices for capture positions
  flags += 'd';
  return flags;
}

function stripComments(pattern) {
  // IgnorePatternWhitespace (32): strip unescaped whitespace and # comments
  // Simplified implementation matching .NET's IgnorePatternWhitespace
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

    const showCaptures = !!(options & SHOW_CAPTURES);
    const processedOptions = options & ~SHOW_CAPTURES;

    try {
      let effectivePattern = pattern;
      if (processedOptions & 32) { // IgnorePatternWhitespace
        effectivePattern = stripComments(pattern);
      }

      const flags = buildFlags(processedOptions);
      const regex = new RegExp(effectivePattern, flags);

      const inputText = text ?? '';
      const matches = [];

      // Timeout guard
      const deadline = Date.now() + REGEX_TIMEOUT_MS;

      const iterator = inputText.matchAll(regex);
      for (const m of iterator) {
        if (Date.now() > deadline) {
          return {
            error: 'The regex match timed out (exceeded 15 seconds).',
            replace: null,
            matches: null,
          };
        }

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

        // Process groups (skip index 0 which is the full match)
        for (let i = 1; i < m.length; i++) {
          const groupValue = m[i] ?? null;
          // Determine group name: check named groups
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
          if (groupValue != null && m.indices && m.indices[i]) {
            groupIndex = m.indices[i][0];
            groupLength = m.indices[i][1] - m.indices[i][0];
          }

          const groupResult = {
            name: groupName,
            index: groupIndex,
            length: groupLength,
            value: groupValue,
            captures: showCaptures && groupValue != null
              ? [{ index: groupIndex, length: groupLength, value: groupValue }]
              : null,
          };

          matchResult.groups.push(groupResult);
        }

        matches.push(matchResult);
      }

      // Replace
      let replaceResult = null;
      if (replace != null) {
        // Use a fresh regex (matchAll exhausts the previous one)
        const replaceRegex = new RegExp(effectivePattern, flags);
        replaceResult = inputText.replace(replaceRegex, replace);
      }

      return { error: null, replace: replaceResult, matches };
    } catch (err) {
      return { error: err.message, replace: null, matches: null };
    }
  }
}
