package io.github.regextester.api.model;

import java.util.List;

/**
 * One match of the pattern against the input text.
 *
 * <p>{@code name} is always {@code "0"}, matching the other engines. {@code groups} is always an
 * array; {@code captures} is null unless ShowCaptures (32768) was set.
 */
public record MatchResult(
        String name,
        int index,
        int length,
        String value,
        List<GroupResult> groups,
        List<CaptureResult> captures) {
}
