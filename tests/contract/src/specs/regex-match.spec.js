import { describe, it, expect } from 'vitest';
import { get } from '../client.js';
import { postRegex, assertRegexResultShape } from '../regexHelpers.js';

describe('POST /api/regex — matching', () => {
  it('finds every match with correct index/value for a simple pattern', async () => {
    const { status, body } = await postRegex({ pattern: '\\d+', text: 'a1b22c', options: 0 });

    expect(status).toBe(200);
    assertRegexResultShape(body);
    expect(body.error).toBeNull();
    expect(body.matches).toHaveLength(2);

    expect(body.matches[0].index).toBe(1);
    expect(body.matches[0].value).toBe('1');
    expect(body.matches[1].index).toBe(3);
    expect(body.matches[1].value).toBe('22');
  });

  it('returns matches: [] when the pattern does not match', async () => {
    const { status, body } = await postRegex({ pattern: 'zzz', text: 'abc', options: 0 });

    expect(status).toBe(200);
    assertRegexResultShape(body);
    expect(body.matches).toEqual([]);
  });

  it('returns { error: null, replace: null, matches: [] } for an empty pattern, never a series of zero-length matches', async () => {
    const { status, body } = await postRegex({ pattern: '', text: 'abc', options: 0 });

    expect(status).toBe(200);
    assertRegexResultShape(body);
    expect(body.error).toBeNull();
    expect(body.replace).toBeNull();
    expect(body.matches).toEqual([]);
  });

  it('returns matches: [] for a null pattern', async () => {
    const { status, body } = await postRegex({ pattern: null, text: 'abc', options: 0 });

    expect(status).toBe(200);
    assertRegexResultShape(body);
    expect(body.error).toBeNull();
    expect(body.replace).toBeNull();
    expect(body.matches).toEqual([]);
  });

  it('returns every non-overlapping match regardless of which option bits are set (engine "global" flags are presentation-only)', async () => {
    const pattern = '\\d+';
    const text = 'a1b22c333';

    const { status: statusZero, body: bodyZero } = await postRegex({ pattern, text, options: 0 });
    expect(statusZero).toBe(200);
    assertRegexResultShape(bodyZero);
    expect(bodyZero.matches.length).toBeGreaterThan(1);

    const capsRes = await get('/api/capabilities');
    const { defaultOptions } = await capsRes.json();

    const { status: statusDefault, body: bodyDefault } = await postRegex({
      pattern,
      text,
      options: defaultOptions,
    });
    expect(statusDefault).toBe(200);
    assertRegexResultShape(bodyDefault);

    expect(bodyDefault.matches).toHaveLength(bodyZero.matches.length);
  });
});
