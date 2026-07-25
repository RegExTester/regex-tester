import { MAX_REQUEST_BODY_BYTES } from '../services/capabilities.js';

/**
 * Express error-handling middleware (4-arg signature). Must be registered last, after all
 * routes, so it catches errors raised by earlier middleware (notably `express.json()`).
 *
 * Ensures the two request-body failure modes documented in the contract always return an
 * RFC 9457 ProblemDetails JSON body instead of Express's default HTML error page, and that no
 * stack trace is ever leaked to the client:
 *   - `PayloadTooLargeError` (body-parser's `entity.too.large`) → HTTP 413.
 *   - Malformed JSON (body-parser's `entity.parse.failed` / a raw `SyntaxError`) → HTTP 400.
 *   - Anything else → HTTP 500 with a generic message; the real error is logged server-side only.
 */
export function errorHandler(err, _req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  if (err.type === 'entity.too.large' || err.status === 413) {
    return res.status(413).json({
      type: 'https://tools.ietf.org/html/rfc9110#section-15.5.14',
      title: 'The request body is too large.',
      status: 413,
      detail: `The request body must not exceed ${MAX_REQUEST_BODY_BYTES} bytes.`,
    });
  }

  if (err.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return res.status(400).json({
      type: 'https://tools.ietf.org/html/rfc9110#section-15.5.1',
      title: 'The request body could not be parsed as JSON.',
      status: 400,
    });
  }

  console.error(err);
  return res.status(500).json({
    type: 'https://tools.ietf.org/html/rfc9110#section-15.6.1',
    title: 'An unexpected error occurred.',
    status: 500,
  });
}
