import { describe, it, expect } from 'vitest';
import { request } from '../client.js';

describe('CORS', () => {
  it('grants Access-Control-Allow-Origin for the hosted frontend origin', async () => {
    const res = await request('/api/regex', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://regextester.github.io',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type',
      },
    });

    const acao = res.headers.get('access-control-allow-origin');
    expect(acao).toBeTruthy();
  });

  it('does not grant a disallowed origin a permissive wildcard', async () => {
    const res = await request('/api/regex', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://evil.example.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type',
      },
    });

    const acao = res.headers.get('access-control-allow-origin');

    expect(
      acao,
      'a disallowed origin MUST NOT be granted a blanket wildcard Access-Control-Allow-Origin: *, in any environment including Development'
    ).not.toBe('*');
    expect(acao, 'a disallowed origin MUST NOT be reflected back verbatim either').not.toBe('https://evil.example.com');
  });
});
