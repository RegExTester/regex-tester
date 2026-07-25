import { RegexProcessor } from '../services/regexProcessor.js';
import { telemetryService } from '../services/telemetryService.js';

export const regexController = {
  /**
   * @openapi
   * /api/regex:
   *   post:
   *     tags: [RegEx]
   *     summary: Run a regular expression and return all matches.
   *     description: |
   *       Applies the provided regex pattern to the input text using the specified option flags.
   *       All string fields are Base64Url-encoded by the Vue.js frontend before submission but
   *       the API itself accepts plain UTF-8 JSON strings.
   *
   *       **Timeout:** The regex engine enforces a 15-second match timeout; the HTTP request
   *       has a 5-second middleware timeout. If either is exceeded an error message is returned
   *       in the `error` field rather than throwing an HTTP error.
   *
   *       **Request size:** The raw request body must not exceed `limits.maxRequestBodyBytes`
   *       (see `GET /api/capabilities`) — currently 8192 bytes. This comfortably fits the
   *       largest valid payload (`pattern` + `text` + `replace` at their documented maximum
   *       lengths, plus JSON overhead and multi-byte UTF-8) while still bounding request size.
   *     requestBody:
   *       description: Regex evaluation request.
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/Input'
   *     responses:
   *       200:
   *         description: Regex executed successfully; inspect `error` field for pattern errors.
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/RegexResult'
   *       400:
   *         description: |
   *           Request body failed model validation (e.g. `pattern` > 512 chars), or the request
   *           body is not valid JSON.
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ProblemDetails'
   *       413:
   *         description: |
   *           The raw request body exceeded `limits.maxRequestBodyBytes` (8192 bytes).
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ProblemDetails'
   */
  match(req, res) {
    const { pattern, text, replace, options } = req.body;

    // Validation
    const errors = {};
    if (pattern != null && pattern.length > 512) {
      errors.pattern = ['Pattern must be 512 characters or fewer.'];
    }
    if (text != null && text.length > 1024) {
      errors.text = ['Text must be 1024 characters or fewer.'];
    }
    if (replace != null && replace.length > 1024) {
      errors.replace = ['Replace must be 1024 characters or fewer.'];
    }

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({
        type: 'https://tools.ietf.org/html/rfc9110#section-15.5.1',
        title: 'One or more validation errors occurred.',
        status: 400,
        errors,
      });
    }

    const start = process.hrtime.bigint();
    const result = RegexProcessor.match(pattern, text, replace, options ?? 0);
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    telemetryService.sendTelemetry(req, { pattern, text, replace, options }, {
      durationMs: Math.round(durationMs),
      matchCount: result.matches.length,
      error: result.error,
    });
    res.json(result);
  },
};
