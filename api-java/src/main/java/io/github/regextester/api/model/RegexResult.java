package io.github.regextester.api.model;

import java.util.List;

/**
 * Response body for {@code POST /api/regex}.
 *
 * <p>Contract invariants (docs/design/api-contract.md §4): every field is always emitted, and
 * {@code matches} is {@code []} and never {@code null} — including on error, timeout and no-match.
 */
public record RegexResult(String error, String replace, List<MatchResult> matches) {

    /** An error result: {@code matches} is an empty list, never null. */
    public static RegexResult error(String message) {
        return new RegexResult(message, null, List.of());
    }

    /** The empty/absent-pattern result required by contract §4.2. */
    public static RegexResult empty() {
        return new RegexResult(null, null, List.of());
    }
}
