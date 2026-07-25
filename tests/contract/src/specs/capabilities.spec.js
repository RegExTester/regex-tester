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

  it('reports a non-empty engineKey', async () => {
    const res = await get('/api/capabilities');
    const body = await res.json();

    expect(typeof body.engineKey).toBe('string');
    expect(body.engineKey.length).toBeGreaterThan(0);
  });

  it('reports contractVersion "1.0"', async () => {
    const res = await get('/api/capabilities');
    const body = await res.json();

    expect(body.contractVersion).toBe('1.0');
  });

  it('reports a non-empty runtime.os and runtime.framework', async () => {
    const res = await get('/api/capabilities');
    const body = await res.json();

    expect(typeof body.runtime.os).toBe('string');
    expect(body.runtime.os.length).toBeGreaterThan(0);
    expect(typeof body.runtime.framework).toBe('string');
    expect(body.runtime.framework.length).toBeGreaterThan(0);
  });

  it('does not include the deprecated osDescription/frameworkDescription aliases', async () => {
    const res = await get('/api/capabilities');
    const body = await res.json();

    expect(body.runtime).not.toHaveProperty('osDescription');
    expect(body.runtime).not.toHaveProperty('frameworkDescription');
    expect(body).not.toHaveProperty('osDescription');
    expect(body).not.toHaveProperty('frameworkDescription');
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

  it('gives every option a unique value and a unique name', async () => {
    const res = await get('/api/capabilities');
    const body = await res.json();

    const values = body.options.map((option) => option.value);
    const names = body.options.map((option) => option.name);

    expect(new Set(values).size, `duplicate option values in [${values.join(', ')}]`).toBe(values.length);
    expect(new Set(names).size, `duplicate option names in [${names.join(', ')}]`).toBe(names.length);
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

describe('GET /api/version (removed)', () => {
  it('returns 404, since /api/version was merged into /api/capabilities', async () => {
    const res = await get('/api/version');
    expect(res.status).toBe(404);
  });
});
