package io.github.regextester.api.service;

import io.github.regextester.api.model.CaptureResult;
import io.github.regextester.api.model.GroupResult;
import io.github.regextester.api.model.MatchResult;
import io.github.regextester.api.model.RegexResult;
import io.github.regextester.api.options.RegexOptions;
import io.github.regextester.api.service.TimeLimitedCharSequence.RegexTimeoutException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;

/**
 * Core regex matching logic backing {@code POST /api/regex}.
 *
 * <p>Uses {@code java.util.regex} only. Pattern syntax errors, bad replacement templates and the
 * 15-second evaluation timeout are all reported via the {@code error} field with HTTP 200 — never as
 * an exception that would surface as an HTTP error status.
 *
 * <p>Unlike api-python, no pattern translation is required: Java spells named groups
 * {@code (?<name>...)}, exactly as .NET and JavaScript do.
 */
@Service
public class RegexProcessor {

    public static final int REGEX_TIMEOUT_MS = 15_000;

    static final String TIMEOUT_MESSAGE = "The regex match timed out (exceeded 15 seconds).";

    /**
     * Run {@code pattern} against {@code text} and build the RegexResult response body.
     *
     * @param options the shared bitmask; unsupported bits are ignored silently
     */
    public RegexResult match(String pattern, String text, String replace, int options) {
        if (pattern == null || pattern.isEmpty()) {
            // Contract §4.2: an empty pattern is NOT a zero-length match at every index.
            return RegexResult.empty();
        }

        boolean showCaptures = RegexOptions.showCaptures(options);
        String inputText = text == null ? "" : text;

        Pattern compiled;
        try {
            compiled = Pattern.compile(pattern, RegexOptions.toPatternFlags(options));
        } catch (IllegalArgumentException e) {
            // Covers PatternSyntaxException (a subclass) and the illegal-flag case.
            return RegexResult.error(describe(e));
        }

        // One deadline covers matching *and* the replacement pass, so a pathological pattern cannot
        // spend 15s on each.
        CharSequence guarded = TimeLimitedCharSequence.withTimeout(inputText, REGEX_TIMEOUT_MS);
        Map<Integer, String> groupNames = invertNamedGroups(compiled);

        List<MatchResult> matches = new ArrayList<>();
        try {
            Matcher matcher = compiled.matcher(guarded);
            int lastEnd = -1;
            while (matcher.find()) {
                // Defensive guard: Matcher.find() already advances past a zero-length match, but
                // this ensures we can never spin forever if that invariant ever changes.
                if (matcher.start() == matcher.end() && matcher.end() == lastEnd) {
                    break;
                }
                lastEnd = matcher.end();
                matches.add(buildMatch(matcher, groupNames, showCaptures));
            }
        } catch (RegexTimeoutException e) {
            return RegexResult.error(TIMEOUT_MESSAGE);
        } catch (RuntimeException e) {
            return RegexResult.error(describe(e));
        }

        String replaced = null;
        if (replace != null) {
            try {
                replaced = compiled.matcher(guarded).replaceAll(toJavaReplacement(replace));
            } catch (RegexTimeoutException e) {
                return RegexResult.error(TIMEOUT_MESSAGE);
            } catch (RuntimeException e) {
                // A bad template (e.g. `$9` with no group 9) is a client error, not a server one:
                // report it in `error` while keeping the matches already found, mirroring api-python.
                return new RegexResult(describe(e), null, matches);
            }
        }

        return new RegexResult(null, replaced, matches);
    }

    /**
     * Reverse of {@link Pattern#namedGroups()} — group number to name.
     *
     * <p>{@code namedGroups()} was added in Java 20 and is the reason this project requires Java 21.
     * Before it, the only way to recover group names was to re-parse the pattern text with another
     * regex, which is fragile around lookbehind ({@code (?<=...)}) and escaped parentheses.
     */
    private static Map<Integer, String> invertNamedGroups(Pattern compiled) {
        Map<String, Integer> named = compiled.namedGroups();
        if (named.isEmpty()) {
            return Map.of();
        }
        Map<Integer, String> byIndex = new HashMap<>(named.size());
        named.forEach((name, index) -> byIndex.put(index, name));
        return byIndex;
    }

    private static MatchResult buildMatch(
            Matcher matcher, Map<Integer, String> groupNames, boolean showCaptures) {

        List<GroupResult> groups = new ArrayList<>();
        for (int i = 1; i <= matcher.groupCount(); i++) {
            int start = matcher.start(i);
            if (start < 0) {
                // The group did not participate in this match.
                continue;
            }
            int end = matcher.end(i);
            String value = matcher.group(i);
            groups.add(new GroupResult(
                    groupNames.getOrDefault(i, String.valueOf(i)),
                    start,
                    end - start,
                    value,
                    showCaptures ? List.of(new CaptureResult(start, end - start, value)) : null));
        }

        int start = matcher.start();
        int end = matcher.end();
        String value = matcher.group();
        return new MatchResult(
                "0",
                start,
                end - start,
                value,
                groups,
                showCaptures ? List.of(new CaptureResult(start, end - start, value)) : null);
    }

    /**
     * Rewrite a contract-flavoured replacement template into Java's dialect.
     *
     * <p>Both understand {@code $1} and {@code ${name}}, so those pass through untouched. They
     * differ on escaping: the contract spells a literal dollar {@code $$}, while Java spells it
     * {@code \$} and treats a bare backslash as an escape character rather than a literal.
     */
    static String toJavaReplacement(String replace) {
        StringBuilder out = new StringBuilder(replace.length() + 8);
        for (int i = 0; i < replace.length(); i++) {
            char c = replace.charAt(i);
            if (c == '\\') {
                out.append("\\\\");
            } else if (c == '$' && i + 1 < replace.length() && replace.charAt(i + 1) == '$') {
                out.append("\\$");
                i++;
            } else {
                out.append(c);
            }
        }
        return out.toString();
    }

    /** Exception messages are surfaced to the client, so never return an empty error string. */
    private static String describe(RuntimeException e) {
        String message = e.getMessage();
        return message == null || message.isEmpty() ? e.getClass().getSimpleName() : message;
    }
}
