/**
 * Shared option flag registry for `GET /api/capabilities`.
 *
 * This is the single source of truth for every flag defined in the contract's option registry
 * (see `docs/design/api-contract.md` §3). It lists every flag known to the contract, not just the
 * ones this engine supports, so the frontend can render unsupported flags as disabled rather than
 * omit them. Values 1-131072, skipping the permanently reserved 128.
 */
import os from 'node:os';

const OPTION_REGISTRY = [
  { value: 1, name: 'IgnoreCase', flag: 'i', supported: true, description: 'Case-insensitive matching.' },
  { value: 2, name: 'Multiline', flag: 'm', supported: true, description: '^ and $ match the start/end of each line rather than the whole input.' },
  { value: 4, name: 'ExplicitCapture', flag: null, supported: false, description: 'Only explicitly named or numbered groups are captured. Not supported by this engine; the bit is ignored.' },
  { value: 8, name: 'Compiled', flag: null, supported: false, description: 'Compiles the regex to improve match speed on repeated use. Not supported by this engine; the bit is ignored.' },
  { value: 16, name: 'Singleline', flag: 's', supported: true, description: 'The `.` character class matches every character, including newlines (dotAll).' },
  { value: 32, name: 'IgnorePatternWhitespace', flag: null, supported: true, description: 'Unescaped whitespace and `#`-prefixed comments in the pattern are stripped before evaluation.' },
  { value: 64, name: 'RightToLeft', flag: null, supported: false, description: 'Scans the input from right to left. Not supported by this engine; the bit is ignored.' },
  { value: 256, name: 'ECMAScript', flag: null, supported: false, description: 'Enables ECMAScript-compliant behaviour for a subset of .NET regex constructs. Not supported by this engine; the bit is ignored.' },
  { value: 512, name: 'CultureInvariant', flag: null, supported: false, description: 'Disables culture-specific behaviour when matching. Not supported by this engine; the bit is ignored.' },
  { value: 1024, name: 'NonBacktracking', flag: null, supported: false, description: 'Uses a non-backtracking matching engine. Not supported by this engine; the bit is ignored.' },
  { value: 2048, name: 'HasIndices', flag: 'd', supported: true, description: 'Generates start/end character indices for each capture group.' },
  { value: 4096, name: 'Global', flag: 'g', supported: true, description: 'Finds all matches in the input rather than stopping after the first.' },
  { value: 8192, name: 'Unicode', flag: 'u', supported: true, description: 'Treats the pattern as a sequence of Unicode code points.' },
  { value: 16384, name: 'UnicodeSets', flag: 'v', supported: true, description: 'Enables set notation and Unicode property escapes for strings (supersedes Unicode).' },
  { value: 32768, name: 'ShowCaptures', flag: null, supported: true, description: 'Custom flag: includes per-group and per-match capture arrays in the response. Stripped before the pattern is evaluated.' },
  { value: 65536, name: 'Sticky', flag: 'y', supported: true, description: 'Matches only starting at the current position (anchored matching).' },
  { value: 131072, name: 'Ascii', flag: null, supported: false, description: 'Restricts character classes to ASCII only. Not supported by this engine; the bit is ignored.' },
  { value: 262144, name: 'UnixLines', flag: null, supported: false, description: "Treats only '\\n' as a line terminator (Java 'UNIX_LINES'). JavaScript also recognises '\\r', '\\u2028' and '\\u2029' and offers no flag to restrict that, so the bit is ignored." },
  { value: 524288, name: 'Literal', flag: null, supported: false, description: "Matches the pattern as a literal string (Java 'LITERAL'). JavaScript has no flag that disables metacharacters; the bit is ignored." },
  { value: 1048576, name: 'UnicodeCase', flag: null, supported: false, description: "Case-folds using Unicode rather than US-ASCII rules (Java 'UNICODE_CASE'). The 'u' and 'v' flags already imply this; the bit is ignored." },
  { value: 2097152, name: 'CanonicalEquivalence', flag: null, supported: false, description: "Matches characters with equal canonical decompositions (Java 'CANON_EQ'). Not supported by this engine; the bit is ignored." },
];

export const ENGINE_KEY = 'NODEJS';
const ENGINE_NAME = 'Node.js';
const CONTRACT_VERSION = '1.0';

// Global (4096) | HasIndices (2048) | IgnoreCase (1) | Multiline (2) = 6147
const DEFAULT_OPTIONS = 4096 | 2048 | 1 | 2;

// Maximum accepted `Content-Length` for `POST /api/regex`, in bytes. Sized to fit the largest
// valid payload (pattern 512 + text 1024 + replace 1024 chars, plus JSON structural overhead and
// multi-byte UTF-8 expansion) while still bounding request size for DoS protection. Shared with
// `src/index.js` (express.json limit) and `src/middleware/errorHandler.js` (413 detail message).
export const MAX_REQUEST_BODY_BYTES = 8192;

const LIMITS = {
  patternMaxLength: 512,
  textMaxLength: 1024,
  replaceMaxLength: 1024,
  regexTimeoutMs: 15000,
  requestTimeoutMs: 5000,
  maxRequestBodyBytes: MAX_REQUEST_BODY_BYTES,
};

const FEATURES = {
  replace: true,
  namedGroups: true,
  captures: 'single',
};

/**
 * Builds the `GET /api/capabilities` response body for this engine.
 */
export function getCapabilities() {
  return {
    engineKey: ENGINE_KEY,
    engineName: ENGINE_NAME,
    contractVersion: CONTRACT_VERSION,
    runtime: {
      os: `${os.type()} ${os.release()} ${os.arch()}`,
      framework: `Node.js ${process.version}`,
    },
    defaultOptions: DEFAULT_OPTIONS,
    limits: LIMITS,
    features: FEATURES,
    options: OPTION_REGISTRY,
  };
}
