/**
 * @openapi
 * components:
 *   schemas:
 *     RegExTesterOptions:
 *       type: integer
 *       description: |
 *         Bitwise flags that control regex matching behaviour.
 *         Values map to JavaScript RegExp flags where applicable.
 *         `ShowCaptures` (32768) is a custom flag handled by the API before forwarding to RegExp.
 *
 *     Input:
 *       type: object
 *       description: Request body for the regex matching endpoint.
 *       properties:
 *         options:
 *           description: |
 *             Bitwise combination of RegExTesterOptions flags.
 *             Use `0` for no options.
 *             The custom `ShowCaptures` flag (32768) causes capture collections to be
 *             included in each match and group; it is stripped before being passed to the
 *             JavaScript `RegExp` constructor.
 *
 *             Supported flags in Node.js:
 *             - IgnoreCase (1) → `i` flag
 *             - Multiline (2) → `m` flag
 *             - Singleline (16) → `s` flag (dotAll)
 *             - IgnorePatternWhitespace (32) → comment/whitespace stripping
 *
 *             Acknowledged but no-op: ExplicitCapture (4), Compiled (8), RightToLeft (64),
 *             ECMAScript (256), CultureInvariant (512), NonBacktracking (1024).
 *           allOf:
 *             - $ref: '#/components/schemas/RegExTesterOptions'
 *         pattern:
 *           type: string
 *           nullable: true
 *           maxLength: 512
 *           minLength: 0
 *           description: The regular expression pattern to evaluate. Maximum 512 characters.
 *         text:
 *           type: string
 *           nullable: true
 *           maxLength: 1024
 *           minLength: 0
 *           description: The input text to search. Maximum 1024 characters.
 *         replace:
 *           type: string
 *           nullable: true
 *           maxLength: 1024
 *           minLength: 0
 *           description: |
 *             Optional replacement string. When supplied, the response will include a `replace`
 *             field containing the result of calling `String.prototype.replace(regex, replace)`.
 *             Maximum 1024 characters.
 *
 *     CaptureResult:
 *       type: object
 *       description: An individual capture produced by a group that matches multiple times.
 *       properties:
 *         index:
 *           type: integer
 *           format: int32
 *           description: Zero-based character offset where this capture starts.
 *         length:
 *           type: integer
 *           format: int32
 *           description: Length of this capture in characters.
 *         value:
 *           type: string
 *           nullable: true
 *           description: The captured substring.
 *
 *     GroupResult:
 *       type: object
 *       description: A single capturing group within a match.
 *       properties:
 *         name:
 *           type: string
 *           nullable: true
 *           description: Group name or number (e.g. `"1"`, `"word"`).
 *         index:
 *           type: integer
 *           format: int32
 *           description: Zero-based character offset where the group match starts.
 *         length:
 *           type: integer
 *           format: int32
 *           description: Length of the group match in characters.
 *         value:
 *           type: string
 *           nullable: true
 *           description: The substring matched by this group.
 *         captures:
 *           type: array
 *           nullable: true
 *           items:
 *             $ref: '#/components/schemas/CaptureResult'
 *           description: |
 *             All individual captures of this group.
 *             Only populated when the `ShowCaptures` flag (32768) is set in `options`.
 *
 *     MatchResult:
 *       type: object
 *       description: A single regex match within the input text.
 *       properties:
 *         name:
 *           type: string
 *           nullable: true
 *           description: Match name (always `"0"` for the whole-match group).
 *         index:
 *           type: integer
 *           format: int32
 *           description: Zero-based character offset where the match starts.
 *         length:
 *           type: integer
 *           format: int32
 *           description: Length of the matched substring in characters.
 *         value:
 *           type: string
 *           nullable: true
 *           description: The matched substring.
 *         groups:
 *           type: array
 *           nullable: true
 *           items:
 *             $ref: '#/components/schemas/GroupResult'
 *           description: Named and numbered capturing groups within this match.
 *         captures:
 *           type: array
 *           nullable: true
 *           items:
 *             $ref: '#/components/schemas/CaptureResult'
 *           description: |
 *             All captures of the whole match.
 *             Only populated when the `ShowCaptures` flag (32768) is set in `options`.
 *
 *     RegexResult:
 *       type: object
 *       description: Top-level result returned by the regex matching endpoint.
 *       properties:
 *         error:
 *           type: string
 *           nullable: true
 *           description: Error message when the pattern is invalid or the match times out; `null` on success.
 *         replace:
 *           type: string
 *           nullable: true
 *           description: |
 *             String produced by applying the `replace` pattern to the input text.
 *             `null` when no replace pattern was supplied.
 *         matches:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/MatchResult'
 *           description: |
 *             All matches found in the input text. MUST be `[]` (never `null`), including on
 *             error, timeout, or no-match.
 *
 *     Runtime:
 *       type: object
 *       description: |
 *         Diagnostic host/runtime information for the running engine. Informational only; MUST
 *         NOT be used by clients to drive frontend behaviour or feature detection.
 *       properties:
 *         os:
 *           type: string
 *           description: Operating system description of the running host.
 *         framework:
 *           type: string
 *           description: Runtime/framework version description.
 *
 *     Limits:
 *       type: object
 *       description: Request size and timeout limits enforced by this engine.
 *       properties:
 *         patternMaxLength:
 *           type: integer
 *           format: int32
 *           description: Maximum length, in characters, accepted for `pattern`.
 *         textMaxLength:
 *           type: integer
 *           format: int32
 *           description: Maximum length, in characters, accepted for `text`.
 *         replaceMaxLength:
 *           type: integer
 *           format: int32
 *           description: Maximum length, in characters, accepted for `replace`.
 *         regexTimeoutMs:
 *           type: integer
 *           format: int32
 *           description: Maximum time, in milliseconds, allowed for regex evaluation before it is aborted and reported as a timeout error.
 *         requestTimeoutMs:
 *           type: integer
 *           format: int32
 *           description: Maximum time, in milliseconds, allowed for the whole HTTP request before it is aborted and reported as a timeout error.
 *         maxRequestBodyBytes:
 *           type: integer
 *           format: int32
 *           description: |
 *             Maximum accepted size, in bytes, of the raw HTTP request body. A body exceeding
 *             this size is rejected with HTTP 413 before JSON parsing/validation runs.
 *
 *     Features:
 *       type: object
 *       description: Optional capabilities this engine implements.
 *       properties:
 *         replace:
 *           type: boolean
 *           description: Whether the `replace` request field is honoured.
 *         namedGroups:
 *           type: boolean
 *           description: Whether named capture groups are supported and reported by name.
 *         captures:
 *           type: string
 *           enum: [none, single, multi]
 *           description: |
 *             The level of per-group capture support when `ShowCaptures` is set. This engine
 *             reports `single`: JavaScript's `RegExp`/`String.matchAll` only exposes the last
 *             capture per group.
 *
 *     CapabilityOption:
 *       type: object
 *       description: Describes one option flag and whether the running engine supports it.
 *       properties:
 *         value:
 *           type: integer
 *           format: int32
 *           description: The bitmask value of this flag.
 *         name:
 *           type: string
 *           description: The canonical flag name (e.g. `IgnoreCase`).
 *         flag:
 *           type: string
 *           nullable: true
 *           description: The engine-native inline flag letter this bit maps to (e.g. `i`); `null` if this engine has no native equivalent.
 *         supported:
 *           type: boolean
 *           description: Whether this engine actually honours the flag. Unsupported flags are still listed so the frontend can render them as disabled.
 *         description:
 *           type: string
 *           description: Human-readable description of the flag's behaviour.
 *
 *     Capabilities:
 *       type: object
 *       description: Response body for `GET /api/capabilities`.
 *       properties:
 *         engineKey:
 *           type: string
 *           description: Short, stable, uppercase identifier for the engine.
 *           example: NODEJS
 *         engineName:
 *           type: string
 *           description: Human-readable engine name.
 *           example: Node.js
 *         contractVersion:
 *           type: string
 *           description: The version of the contract this engine implements.
 *           example: "1.0"
 *         runtime:
 *           $ref: '#/components/schemas/Runtime'
 *         defaultOptions:
 *           type: integer
 *           format: int32
 *           description: The bitmask the frontend should pre-select for this engine when no shared URL state is present.
 *         limits:
 *           $ref: '#/components/schemas/Limits'
 *         features:
 *           $ref: '#/components/schemas/Features'
 *         options:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/CapabilityOption'
 *           description: Every option flag known to the contract, annotated with whether this engine actually supports it.
 *
 *     ProblemDetails:
 *       type: object
 *       description: RFC 9457 problem details returned for request validation failures (HTTP 400).
 *       properties:
 *         type:
 *           type: string
 *           nullable: true
 *         title:
 *           type: string
 *           nullable: true
 *         status:
 *           type: integer
 *           nullable: true
 *           format: int32
 *         detail:
 *           type: string
 *           nullable: true
 *         instance:
 *           type: string
 *           nullable: true
 *         errors:
 *           type: object
 *           description: Validation errors keyed by field name.
 *           additionalProperties:
 *             type: array
 *             items:
 *               type: string
 *
 * tags:
 *   - name: Home
 *   - name: Capabilities
 *   - name: RegEx
 */
