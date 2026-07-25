// Shared helpers for every `/api/regex` spec, so the universal invariants
// (all keys present even when null, `matches` always an array, every
// MatchResult/GroupResult fully shaped, body validates against the
// canonical RegexResult schema) are enforced identically everywhere.

import { expect } from 'vitest';
import { post } from './client.js';
import { validate } from './schema.js';

/** POST /api/regex and parse the JSON body. */
export async function postRegex(input, init = {}) {
  const res = await post('/api/regex', input, init);
  const body = await res.json();
  return { status: res.status, headers: res.headers, body };
}

/**
 * Assert the universal RegexResult invariants against a parsed response
 * body. MUST be called from every `/api/regex` spec that inspects a 200
 * response body.
 */
export function assertRegexResultShape(body) {
  expect(Object.hasOwn(body, 'error')).toBe(true);
  expect(Object.hasOwn(body, 'replace')).toBe(true);
  expect(Object.hasOwn(body, 'matches')).toBe(true);
  expect(Array.isArray(body.matches)).toBe(true);

  for (const match of body.matches) {
    for (const key of ['name', 'index', 'length', 'value', 'groups', 'captures']) {
      expect(Object.hasOwn(match, key), `MatchResult missing key "${key}"`).toBe(true);
    }
    expect(Array.isArray(match.groups)).toBe(true);
    for (const group of match.groups) {
      for (const key of ['name', 'index', 'length', 'value', 'captures']) {
        expect(Object.hasOwn(group, key), `GroupResult missing key "${key}"`).toBe(true);
      }
    }
  }

  const { valid, errors } = validate('RegexResult', body);
  expect(valid, JSON.stringify(errors)).toBe(true);
}
