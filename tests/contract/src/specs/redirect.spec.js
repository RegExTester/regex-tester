import { describe, it, expect } from 'vitest';
import { request } from '../client.js';

describe('GET /', () => {
  it('redirects to the hosted frontend with a 302 and does not follow it', async () => {
    const res = await request('/');

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://regextester.github.io/');
    // `client.request` uses redirect: 'manual', so receiving the 302 itself
    // (rather than a followed 200) confirms the redirect was not followed.
    expect(res.redirected).toBe(false);
  });
});
