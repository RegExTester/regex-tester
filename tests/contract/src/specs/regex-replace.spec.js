import { describe, it, expect } from 'vitest';
import { postRegex, assertRegexResultShape } from '../regexHelpers.js';

describe('POST /api/regex — replace', () => {
  it('applies a $-group replacement template', async () => {
    const { status, body } = await postRegex({
      pattern: '(\\w+) (\\w+)',
      text: 'hello world',
      replace: '$2 $1',
      options: 0,
    });

    expect(status).toBe(200);
    assertRegexResultShape(body);
    expect(body.replace).toBe('world hello');
  });

  it('returns replace: null when replace is omitted', async () => {
    const { status, body } = await postRegex({
      pattern: '(\\w+) (\\w+)',
      text: 'hello world',
      options: 0,
    });

    expect(status).toBe(200);
    assertRegexResultShape(body);
    expect(body.replace).toBeNull();
  });
});
