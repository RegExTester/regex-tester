package io.github.regextester.api.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;
import java.util.Map;

/**
 * RFC 9457 problem body, used for HTTP 400 (validation) and HTTP 413 (body too large).
 *
 * <p>{@code errors} maps each invalid field to an <em>array</em> of message strings, which the
 * contract requires even on engines whose native validation produces a single string per field.
 * It is the only field that may be omitted, since a 413 has no per-field errors to report.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ProblemDetailsResponse(
        String type,
        String title,
        int status,
        Map<String, List<String>> errors) {

    public static final String TYPE_VALIDATION = "https://tools.ietf.org/html/rfc9110#section-15.5.1";
    public static final String TYPE_PAYLOAD_TOO_LARGE = "https://tools.ietf.org/html/rfc9110#section-15.5.9";

    public static ProblemDetailsResponse validation(Map<String, List<String>> errors) {
        return new ProblemDetailsResponse(TYPE_VALIDATION, "One or more validation errors occurred.", 400, errors);
    }

    public static ProblemDetailsResponse payloadTooLarge(int maxBytes) {
        return new ProblemDetailsResponse(
                TYPE_PAYLOAD_TOO_LARGE,
                "The request body exceeds the maximum allowed size of " + maxBytes + " bytes.",
                413,
                null);
    }
}
