import { describe, it, expect } from 'vitest';
import { postRegex, assertRegexResultShape } from '../regexHelpers.js';

describe('POST /api/regex — engine errors', () => {
  it('reports an invalid pattern as HTTP 200 with error populated, not an HTTP error status', async () => {
    const { status, body } = await postRegex({ pattern: '([', text: 'abc', options: 0 });

    expect(status).toBe(200);
    assertRegexResultShape(body);
    expect(typeof body.error).toBe('string');
    expect(body.error.length).toBeGreaterThan(0);
    expect(body.matches).toEqual([]);
    expect(body.replace).toBeNull();
  });
});
