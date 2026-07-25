package io.github.regextester.api.model;

import jakarta.validation.constraints.Size;

/**
 * Request body for {@code POST /api/regex}. No property is required.
 *
 * <p>The {@code @Size} limits are the contract's field limits (docs/design/api-contract.md §5) and
 * are reported verbatim by {@code GET /api/capabilities}. A violation surfaces as HTTP 400 with an
 * RFC 9457 ProblemDetails body via {@code ApiExceptionHandler}.
 *
 * <p>{@code options} is a primitive {@code int} so an omitted property deserializes to 0 rather
 * than null.
 */
public record Input(
        @Size(max = 512, message = "The field pattern must be a string with a maximum length of 512.")
        String pattern,

        @Size(max = 1024, message = "The field text must be a string with a maximum length of 1024.")
        String text,

        @Size(max = 1024, message = "The field replace must be a string with a maximum length of 1024.")
        String replace,

        int options) {
}
