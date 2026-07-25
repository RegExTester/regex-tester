import { describe, it, expect } from 'vitest';
import { postRegex, assertRegexResultShape } from '../regexHelpers.js';

describe('POST /api/regex — groups', () => {
  it('reports named capture groups with correct index/length/value', async () => {
    const { status, body } = await postRegex({
      pattern: '(?<y>\\d{4})-(?<m>\\d{2})',
      text: '2026-07',
      options: 0,
    });

    expect(status).toBe(200);
    assertRegexResultShape(body);
    expect(body.matches).toHaveLength(1);

    const groups = body.matches[0].groups;
    const y = groups.find((g) => g.name === 'y');
    const m = groups.find((g) => g.name === 'm');

    expect(y).toBeDefined();
    expect(y.value).toBe('2026');
    expect(y.index).toBe(0);
    expect(y.length).toBe(4);

    expect(m).toBeDefined();
    expect(m.value).toBe('07');
    expect(m.index).toBe(5);
    expect(m.length).toBe(2);
  });

  it('reports unnamed groups as bare numeric strings ("1", "2", ...)', async () => {
    const { status, body } = await postRegex({
      pattern: '(\\d{4})-(\\d{2})',
      text: '2026-07',
      options: 0,
    });

    expect(status).toBe(200);
    assertRegexResultShape(body);
    expect(body.matches).toHaveLength(1);

    const groups = body.matches[0].groups;
    const g1 = groups.find((g) => g.name === '1');
    const g2 = groups.find((g) => g.name === '2');

    expect(g1).toBeDefined();
    expect(g1.value).toBe('2026');
    expect(g2).toBeDefined();
    expect(g2.value).toBe('07');
  });
});
