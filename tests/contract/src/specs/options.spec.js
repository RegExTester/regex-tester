import { describe, it, expect } from 'vitest';
import { get } from '../client.js';
import { postRegex, assertRegexResultShape } from '../regexHelpers.js';

const IGNORE_CASE = 1;
const EXPLICIT_CAPTURE = 4;
const GLOBAL = 4096;
const UNIX_LINES = 262144;
const LITERAL = 524288;
const UNICODE_CASE = 1048576;
const CANONICAL_EQUIVALENCE = 2097152;

// Must stay unallocated in the contract's flag registry (docs/design/api-contract.md §3).
// The highest allocated bit is 2097152 (1 << 21), so 1 << 30 leaves plenty of headroom while
// staying inside int32.
const UNKNOWN_BIT = 1 << 30;

/** True when the running engine reports `value` as natively supported. */
async function supports(value) {
  const res = await get('/api/capabilities');
  const body = await res.json();
  return body.options.some((option) => option.value === value && option.supported);
}

describe('POST /api/regex — options', () => {
  it('accepts a request with options omitted', async () => {
    const { status, body } = await postRegex({ pattern: '\\d+', text: 'a1' });

    expect(status).toBe(200);
    assertRegexResultShape(body);
    expect(body.error).toBeNull();
  });

  it('accepts options: 0', async () => {
    const { status, body } = await postRegex({ pattern: '\\d+', text: 'a1', options: 0 });

    expect(status).toBe(200);
    assertRegexResultShape(body);
    expect(body.error).toBeNull();
  });

  it('silently ignores an unknown option bit', async () => {
    const { status, body } = await postRegex({ pattern: '\\d+', text: 'a1', options: UNKNOWN_BIT });

    expect(status).toBe(200);
    assertRegexResultShape(body);
    expect(body.error).toBeNull();
  });

  it('accepts options: 4096 (Global) with no error on every engine', async () => {
    const { status, body } = await postRegex({ pattern: '\\d+', text: 'a1', options: GLOBAL });

    expect(status).toBe(200);
    assertRegexResultShape(body);
    expect(body.error).toBeNull();
  });

  it('still matches case-insensitively when an unsupported bit is OR-ed with IgnoreCase', async () => {
    const { status, body } = await postRegex({
      pattern: 'ABC',
      text: 'xx abc xx',
      options: IGNORE_CASE | EXPLICIT_CAPTURE,
    });

    expect(status).toBe(200);
    assertRegexResultShape(body);
    expect(body.error).toBeNull();
    expect(body.matches).toHaveLength(1);
    expect(body.matches[0].value.toLowerCase()).toBe('abc');
  });
});

// The four bits below are natively supported only by api-java. Every engine must still accept
// them without error (§4: unsupported bits are ignored, never rejected), so each test asserts the
// engine-agnostic outcome first and only then the behaviour that differs.
describe('POST /api/regex — Java Pattern option bits', () => {
  it('accepts all four of the Java-only bits without error', async () => {
    const { status, body } = await postRegex({
      pattern: 'abc',
      text: 'abc',
      options: UNIX_LINES | LITERAL | UNICODE_CASE | CANONICAL_EQUIVALENCE,
    });

    expect(status).toBe(200);
    assertRegexResultShape(body);
    expect(body.error).toBeNull();
  });

  it('treats only \\n as a line terminator when UnixLines is supported', async () => {
    // Java recognises \r as a line terminator by default, so `^b` matches after it; UnixLines
    // turns that off. .NET and Python are already \n-only. JavaScript also honours \r and has no
    // flag to restrict it, so it stays divergent — hence the assertion is gated on capabilities.
    const { status, body } = await postRegex({
      pattern: '^b',
      text: 'a\rb',
      options: 2 | UNIX_LINES, // Multiline | UnixLines
    });

    expect(status).toBe(200);
    assertRegexResultShape(body);
    expect(body.error).toBeNull();

    if (await supports(UNIX_LINES)) {
      expect(body.matches).toHaveLength(0);
    }
  });

  it('folds case using Unicode rules when UnicodeCase is combined with IgnoreCase', async () => {
    // Java's CASE_INSENSITIVE alone folds ASCII only, so \u00C5 would not match \u00E5.
    // The other three already fold with Unicode semantics, so all four agree once the bit is set.
    const { status, body } = await postRegex({
      pattern: '\u00C5',
      text: '\u00E5',
      options: IGNORE_CASE | UNICODE_CASE,
    });

    expect(status).toBe(200);
    assertRegexResultShape(body);
    expect(body.error).toBeNull();
    expect(body.matches).toHaveLength(1);
  });

  it('strips metacharacters of their meaning when Literal is supported, and is inert otherwise', async () => {
    const { status, body } = await postRegex({ pattern: 'a.c', text: 'a.c abc', options: LITERAL });

    expect(status).toBe(200);
    assertRegexResultShape(body);
    expect(body.error).toBeNull();

    if (await supports(LITERAL)) {
      expect(body.matches).toHaveLength(1);
      expect(body.matches[0].value).toBe('a.c');
    } else {
      // The bit is ignored, so `.` stays a metacharacter and 'abc' matches too.
      expect(body.matches).toHaveLength(2);
    }
  });

  it('matches canonically equivalent sequences when CanonicalEquivalence is supported', async () => {
    // Pattern is the precomposed å (U+00E5); text is 'a' + COMBINING RING ABOVE (U+030A).
    const { status, body } = await postRegex({
      pattern: '\u00E5',
      text: 'a\u030A',
      options: CANONICAL_EQUIVALENCE,
    });

    expect(status).toBe(200);
    assertRegexResultShape(body);
    expect(body.error).toBeNull();
    expect(body.matches).toHaveLength((await supports(CANONICAL_EQUIVALENCE)) ? 1 : 0);
  });
});
