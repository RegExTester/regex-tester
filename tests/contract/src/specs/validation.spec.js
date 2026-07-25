import { describe, it, expect } from 'vitest';
import { post } from '../client.js';
import { validate } from '../schema.js';
import { assertRegexResultShape } from '../regexHelpers.js';

const MAX_REQUEST_BODY_BYTES = 8192;

async function postAndParse(input) {
  const res = await post('/api/regex', input);
  const body = await res.json();
  return { status: res.status, body };
}

function assertProblemDetails(body) {
  const { valid, errors } = validate('ProblemDetails', body);
  expect(valid, JSON.stringify(errors)).toBe(true);
  expect(body.status).toBe(400);

  for (const [field, messages] of Object.entries(body.errors)) {
    expect(Array.isArray(messages), `errors["${field}"] must be an array of strings`).toBe(true);
    for (const message of messages) {
      expect(typeof message).toBe('string');
    }
  }
}

function assertProblemDetails413(body) {
  const { valid, errors } = validate('ProblemDetails', body);
  expect(valid, JSON.stringify(errors)).toBe(true);
  expect(body.status).toBe(413);
  expect(typeof body.type).toBe('string');
  expect(body.type.length).toBeGreaterThan(0);
  expect(typeof body.title).toBe('string');
  expect(body.title.length).toBeGreaterThan(0);
}

describe('POST /api/regex — request validation', () => {
  it('rejects a pattern over 512 characters with HTTP 400 ProblemDetails', async () => {
    const { status, body } = await postAndParse({ pattern: 'a'.repeat(513), text: 'abc', options: 0 });

    expect(status).toBe(400);
    assertProblemDetails(body);
    expect(Object.keys(body.errors)).toContain('pattern');
  });

  it('rejects text over 1024 characters with HTTP 400 ProblemDetails', async () => {
    const { status, body } = await postAndParse({ pattern: 'a', text: 'a'.repeat(1025), options: 0 });

    expect(status).toBe(400);
    assertProblemDetails(body);
    expect(Object.keys(body.errors)).toContain('text');
  });

  it('rejects replace over 1024 characters with HTTP 400 ProblemDetails', async () => {
    const { status, body } = await postAndParse({
      pattern: 'a',
      text: 'abc',
      replace: 'a'.repeat(1025),
      options: 0,
    });

    expect(status).toBe(400);
    assertProblemDetails(body);
    expect(Object.keys(body.errors)).toContain('replace');
  });

  it('accepts a maximum-size valid payload (512-char pattern, 1024-char text, 1024-char replace) with HTTP 200', async () => {
    const input = {
      pattern: 'a'.repeat(512),
      text: 'a'.repeat(1024),
      replace: 'a'.repeat(1024),
      options: 0,
    };

    // Sanity-check the payload is still well within the request body limit before asserting.
    const bodyBytes = Buffer.byteLength(JSON.stringify(input), 'utf8');
    expect(bodyBytes).toBeLessThan(MAX_REQUEST_BODY_BYTES);

    const { status, body } = await postAndParse(input);

    expect(status).toBe(200);
    assertRegexResultShape(body);
    expect(body.error).toBeNull();
  });

  it('rejects a request body exceeding maxRequestBodyBytes (8192) with HTTP 413 ProblemDetails', async () => {
    const input = { pattern: null, text: 'a'.repeat(9000), replace: null, options: 0 };
    const bodyBytes = Buffer.byteLength(JSON.stringify(input), 'utf8');
    expect(bodyBytes).toBeGreaterThan(MAX_REQUEST_BODY_BYTES);

    const res = await post('/api/regex', input);
    const contentType = res.headers.get('content-type') ?? '';

    expect(res.status).toBe(413);
    expect(contentType).toMatch(/application\/(problem\+)?json/);

    const text = await res.text();
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toMatch(/<html/i);

    const body = JSON.parse(text);
    assertProblemDetails413(body);
  });
});
