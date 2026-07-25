import { describe, it, expect } from 'vitest';
import { get } from '../client.js';
import { validate } from '../schema.js';

describe('GET /api/version', () => {
  it('returns 200 and validates against VersionResult', async () => {
    const res = await get('/api/version');
    expect(res.status).toBe(200);

    const body = await res.json();
    const { valid, errors } = validate('VersionResult', body);
    expect(valid, JSON.stringify(errors)).toBe(true);
  });

  it('reports a non-empty engineKey', async () => {
    const res = await get('/api/version');
    const body = await res.json();

    expect(typeof body.engineKey).toBe('string');
    expect(body.engineKey.length).toBeGreaterThan(0);
  });

  it('reports contractVersion "1.0"', async () => {
    const res = await get('/api/version');
    const body = await res.json();

    expect(body.contractVersion).toBe('1.0');
  });
});
