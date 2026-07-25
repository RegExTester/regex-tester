import { describe, it, expect } from 'vitest';
import { get } from '../client.js';
import { validate } from '../schema.js';

function isPowerOfTwo(n) {
  return Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;
}

describe('GET /api/capabilities', () => {
  it('returns 200 and validates against Capabilities', async () => {
    const res = await get('/api/capabilities');
    expect(res.status).toBe(200);

    const body = await res.json();
    const { valid, errors } = validate('Capabilities', body);
    expect(valid, JSON.stringify(errors)).toBe(true);
  });

  it('is cacheable for 24 hours', async () => {
    const res = await get('/api/capabilities');
    const cacheControl = res.headers.get('cache-control') ?? '';

    expect(cacheControl).toMatch(/max-age=86400/);
  });

  it('lists a non-empty set of options, none of which is the reserved bit 128', async () => {
    const res = await get('/api/capabilities');
    const body = await res.json();

    expect(body.options.length).toBeGreaterThan(0);
    expect(body.options.some((option) => option.value === 128)).toBe(false);
  });

  it('gives every option a power-of-two value', async () => {
    const res = await get('/api/capabilities');
    const body = await res.json();

    for (const option of body.options) {
      expect(isPowerOfTwo(option.value), `option "${option.name}" value ${option.value} is not a power of two`).toBe(
        true
      );
    }
  });

  it('only pre-selects bits that are supported: true', async () => {
    const res = await get('/api/capabilities');
    const body = await res.json();

    const supportedMask = body.options
      .filter((option) => option.supported)
      .reduce((mask, option) => mask | option.value, 0);

    // Any bit set in defaultOptions that is NOT in supportedMask should be 0.
    expect((body.defaultOptions & ~supportedMask) >>> 0).toBe(0);
  });

  it('reports maxRequestBodyBytes comfortably larger than the sum of the field length limits', async () => {
    const res = await get('/api/capabilities');
    const body = await res.json();
    const { limits } = body;

    expect(limits.maxRequestBodyBytes).toBeTypeOf('number');

    const fieldLimitSum = limits.patternMaxLength + limits.textMaxLength + limits.replaceMaxLength;
    expect(
      limits.maxRequestBodyBytes,
      `maxRequestBodyBytes (${limits.maxRequestBodyBytes}) must exceed the sum of the field limits (${fieldLimitSum}), otherwise the maximum valid payload would itself be rejected with HTTP 413`
    ).toBeGreaterThan(fieldLimitSum);
  });
});
