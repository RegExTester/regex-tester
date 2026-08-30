package io.github.regextester.api.model;

import io.javalin.openapi.OpenApiStringValidation;

/**
 * Request body for {@code POST /api/regex}. No property is required.
 *
 * <p>The limits below are the contract's field limits (docs/design/api-contract.md §5) and are
 * reported verbatim by {@code GET /api/capabilities}. {@code @OpenApiStringValidation} is read at
 * compile time by the OpenAPI annotation processor and is <em>documentation only</em> — enforcement
 * lives in {@code App.validate}, which produces the HTTP 400 RFC 9457 ProblemDetails body.
 *
 * <p>{@code options} is a primitive {@code int} so an omitted property deserializes to 0 rather
 * than null.
 */
public record Input(
        @OpenApiStringValidation(maxLength = "512")
        String pattern,

        @OpenApiStringValidation(maxLength = "1024")
        String text,

        @OpenApiStringValidation(maxLength = "1024")
        String replace,

        int options) {
}
