package io.github.regextester.api.options;

import io.github.regextester.api.model.Capabilities.CapabilityOption;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * The shared option bitmask, and its mapping onto {@link java.util.regex.Pattern} flags.
 *
 * <p>The bitmask is identical across every backend (docs/design/api-contract.md §3). Only a subset
 * of bits have a native Java equivalent; every other bit MUST be accepted and silently ignored
 * rather than rejected, so one bitmask stays portable across engines and a shared URL keeps working
 * when the user switches engine.
 */
public final class RegexOptions {

    public static final int IGNORE_CASE = 1;
    public static final int MULTILINE = 2;
    public static final int EXPLICIT_CAPTURE = 4;
    public static final int COMPILED = 8;
    public static final int SINGLELINE = 16;
    public static final int IGNORE_PATTERN_WHITESPACE = 32;
    public static final int RIGHT_TO_LEFT = 64;
    // 128 is permanently reserved (historically .NET's internal Debug bit) and must never be used.
    public static final int ECMASCRIPT = 256;
    public static final int CULTURE_INVARIANT = 512;
    public static final int NON_BACKTRACKING = 1024;
    public static final int HAS_INDICES = 2048;
    public static final int GLOBAL = 4096;
    public static final int UNICODE = 8192;
    public static final int UNICODE_SETS = 16384;
    public static final int SHOW_CAPTURES = 32768;
    public static final int STICKY = 65536;
    public static final int ASCII = 131072;
    public static final int UNIX_LINES = 262144;
    public static final int LITERAL = 524288;
    public static final int UNICODE_CASE = 1048576;
    public static final int CANONICAL_EQUIVALENCE = 2097152;

    /** Pre-selected bitmask the frontend defaults to for this engine (IgnoreCase | Multiline). */
    public static final int DEFAULT_OPTIONS = IGNORE_CASE | MULTILINE;

    /**
     * Bits this engine natively supports, mapped to their {@code java.util.regex.Pattern} flag.
     *
     * <p>Unicode maps to {@code UNICODE_CHARACTER_CLASS} because Java's {@code \w}, {@code \d},
     * {@code \s} and {@code \b} are ASCII-only by default; that flag makes them Unicode-aware and,
     * per its javadoc, implies {@code UNICODE_CASE} as well — which is why {@link #UNICODE_CASE}
     * has its own bit only for requesting the case folding *without* the character-class change.
     *
     * <p>{@code Map.of} accepts at most 10 key/value pairs and this map now holds 9. The next flag
     * added here must switch it to {@code Map.ofEntries}.
     */
    private static final Map<Integer, Integer> SUPPORTED_PATTERN_FLAGS = Map.of(
            IGNORE_CASE, Pattern.CASE_INSENSITIVE,
            MULTILINE, Pattern.MULTILINE,
            SINGLELINE, Pattern.DOTALL,
            IGNORE_PATTERN_WHITESPACE, Pattern.COMMENTS,
            UNICODE, Pattern.UNICODE_CHARACTER_CLASS,
            UNIX_LINES, Pattern.UNIX_LINES,
            LITERAL, Pattern.LITERAL,
            UNICODE_CASE, Pattern.UNICODE_CASE,
            CANONICAL_EQUIVALENCE, Pattern.CANON_EQ);

    private RegexOptions() {
    }

    /**
     * Translate the bitmask to {@code java.util.regex.Pattern} flags, ignoring every unsupported or
     * unknown bit — including ShowCaptures, which is a presentation concern and MUST never reach
     * the regex engine.
     */
    public static int toPatternFlags(int options) {
        int flags = 0;
        for (Map.Entry<Integer, Integer> entry : SUPPORTED_PATTERN_FLAGS.entrySet()) {
            if ((options & entry.getKey()) != 0) {
                flags |= entry.getValue();
            }
        }
        return flags;
    }

    /** True when the caller asked for capture arrays on the match and each group. */
    public static boolean showCaptures(int options) {
        return (options & SHOW_CAPTURES) != 0;
    }

    private static final String UNSUPPORTED = " Not supported by this engine; the bit is ignored.";

    /**
     * Every flag known to the contract, for {@code GET /api/capabilities}. Unsupported flags are
     * still listed (with {@code supported: false} and {@code flag: null}) so the frontend can render
     * them as disabled rather than omit them.
     */
    public static final List<CapabilityOption> REGISTRY = List.of(
            new CapabilityOption(IGNORE_CASE, "IgnoreCase", "CASE_INSENSITIVE", true,
                    "Case-insensitive matching."),
            new CapabilityOption(MULTILINE, "Multiline", "MULTILINE", true,
                    "^ and $ match at the start/end of each line."),
            new CapabilityOption(EXPLICIT_CAPTURE, "ExplicitCapture", null, false,
                    "Only explicitly named or numbered groups are captured." + UNSUPPORTED),
            new CapabilityOption(COMPILED, "Compiled", null, false,
                    "Compiles the regex to improve performance on repeated use. Java always "
                            + "precompiles a Pattern, so there is nothing to opt into; the bit is ignored."),
            new CapabilityOption(SINGLELINE, "Singleline", "DOTALL", true,
                    "The . metacharacter also matches newline characters."),
            new CapabilityOption(IGNORE_PATTERN_WHITESPACE, "IgnorePatternWhitespace", "COMMENTS", true,
                    "Unescaped whitespace in the pattern is ignored and # starts a comment."),
            new CapabilityOption(RIGHT_TO_LEFT, "RightToLeft", null, false,
                    "Matching proceeds from right to left." + UNSUPPORTED),
            new CapabilityOption(ECMASCRIPT, "ECMAScript", null, false,
                    "Enables ECMAScript-compliant matching behaviour." + UNSUPPORTED),
            new CapabilityOption(CULTURE_INVARIANT, "CultureInvariant", null, false,
                    "Ignores culture-specific casing rules." + UNSUPPORTED),
            new CapabilityOption(NON_BACKTRACKING, "NonBacktracking", null, false,
                    "Uses a non-backtracking matching engine." + UNSUPPORTED),
            new CapabilityOption(HAS_INDICES, "HasIndices", null, false,
                    "Reports the start/end indices of each capture group. Java always reports them, "
                            + "so there is nothing to opt into; the bit is ignored."),
            new CapabilityOption(GLOBAL, "Global", null, false,
                    "Finds all matches rather than stopping after the first. This API always returns "
                            + "every match, so the bit is ignored."),
            new CapabilityOption(UNICODE, "Unicode", "UNICODE_CHARACTER_CLASS", true,
                    "Makes \\w, \\W, \\b, \\B, \\d, \\D, \\s and \\S Unicode-aware, and enables "
                            + "Unicode-aware case folding."),
            new CapabilityOption(UNICODE_SETS, "UnicodeSets", null, false,
                    "Enables the extended Unicode set notation." + UNSUPPORTED),
            new CapabilityOption(SHOW_CAPTURES, "ShowCaptures", null, true,
                    "Include individual capture arrays on the match and each group. Stripped before "
                            + "the pattern is compiled."),
            new CapabilityOption(STICKY, "Sticky", null, false,
                    "Matching only succeeds at the current position." + UNSUPPORTED),
            new CapabilityOption(ASCII, "Ascii", null, false,
                    "Makes \\w, \\W, \\b, \\B, \\d, \\D, \\s and \\S match only ASCII characters. "
                            + "That is already Java's default, so there is nothing to opt into; the "
                            + "bit is ignored. Use Unicode (8192) for the inverse."),
            new CapabilityOption(UNIX_LINES, "UnixLines", "UNIX_LINES", true,
                    "Only \\n is treated as a line terminator by ^, $ and . — excluding \\r\\n, \\r, "
                            + "\\u0085, \\u2028 and \\u2029, which Java otherwise recognises."),
            new CapabilityOption(LITERAL, "Literal", "LITERAL", true,
                    "The pattern is matched as a literal string; metacharacters and escape "
                            + "sequences lose their special meaning."),
            new CapabilityOption(UNICODE_CASE, "UnicodeCase", "UNICODE_CASE", true,
                    "Case-insensitive matching folds according to the Unicode standard rather than "
                            + "US-ASCII. Unicode (8192) already implies this; use this bit to get "
                            + "Unicode case folding without Unicode-aware \\w, \\d, \\s and \\b."),
            new CapabilityOption(CANONICAL_EQUIVALENCE, "CanonicalEquivalence", "CANON_EQ", true,
                    "Two characters match when their full canonical decompositions are equal, so "
                            + "the pattern \\u00E5 matches the text a\\u030A."));
}
