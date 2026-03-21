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
 *           nullable: true
 *           items:
 *             $ref: '#/components/schemas/MatchResult'
 *           description: All matches found in the input text. Empty array when there are no matches.
 *
 *     ProblemDetails:
 *       type: object
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
 *
 * tags:
 *   - name: Home
 *   - name: RegEx
 */
