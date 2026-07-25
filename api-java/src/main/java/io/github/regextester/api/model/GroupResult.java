package io.github.regextester.api.model;

import java.util.List;

/**
 * A capture group within a match.
 *
 * <p>{@code captures} is null unless ShowCaptures (32768) was set on the request. Jackson emits it
 * as an explicit {@code null} either way — the contract forbids null-omission.
 */
public record GroupResult(
        String name,
        int index,
        int length,
        String value,
        List<CaptureResult> captures) {
}
