import { describe, it, expect } from 'vitest';
import { postRegex, assertRegexResultShape } from '../regexHelpers.js';

const IGNORE_CASE = 1;
const EXPLICIT_CAPTURE = 4;
const GLOBAL = 4096;
const UNKNOWN_BIT = 1 << 20;

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
