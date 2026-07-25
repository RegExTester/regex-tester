import { describe, it, expect } from 'vitest';
import { get } from '../client.js';
import { postRegex, assertRegexResultShape } from '../regexHelpers.js';

const SHOW_CAPTURES = 32768;

describe('POST /api/regex — captures', () => {
  it('reports captures as null everywhere when ShowCaptures is not set', async () => {
    const { status, body } = await postRegex({ pattern: '(\\w)+', text: 'abc', options: 0 });

    expect(status).toBe(200);
    assertRegexResultShape(body);
    expect(body.matches).toHaveLength(1);
    expect(body.matches[0].captures).toBeNull();
    for (const group of body.matches[0].groups) {
      expect(group.captures).toBeNull();
    }
  });

  it('reports captures as an array when ShowCaptures is set', async () => {
    const { status, body } = await postRegex({
      pattern: '(\\w)+',
      text: 'abc',
      options: SHOW_CAPTURES,
    });

    expect(status).toBe(200);
    assertRegexResultShape(body);
    expect(body.matches).toHaveLength(1);
    expect(Array.isArray(body.matches[0].captures)).toBe(true);

    const repeatedGroup = body.matches[0].groups.find((g) => g.name === '1');
    expect(repeatedGroup).toBeDefined();
    expect(Array.isArray(repeatedGroup.captures)).toBe(true);
    expect(repeatedGroup.captures.length).toBeGreaterThanOrEqual(1);

    // The ONLY permitted engine-conditional assertion in the entire suite:
    // engines whose regex library exposes every capture of a repeated group
    // (features.captures === "multi") must report more than one capture for
    // `(\w)+` over "abc"; engines that only keep the last capture per group
    // (features.captures === "single"/"none") are still valid with exactly one.
    const capabilitiesRes = await get('/api/capabilities');
    const capabilities = await capabilitiesRes.json();

    if (capabilities.features.captures === 'multi') {
      expect(repeatedGroup.captures.length).toBeGreaterThan(1);
    }
  });
});
