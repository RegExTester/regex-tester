package io.github.regextester.api.controller;

import io.github.regextester.api.filter.MaxBodySizeFilter;
import io.github.regextester.api.filter.MaxBodySizeFilter.BodyTooLargeException;
import io.github.regextester.api.model.ProblemDetailsResponse;
import io.github.regextester.api.model.RegexResult;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.async.AsyncRequestTimeoutException;

/**
 * Maps framework exceptions onto the contract's error semantics.
 *
 * <p>The rules being enforced here are the ones most commonly broken (see
 * docs/design/api-contract.md §4): validation is 400 with {@code errors: { field: string[] }}, an
 * oversized body is 413, and a request timeout is <strong>HTTP 200</strong> — never 408, never 503.
 */
@RestControllerAdvice
public class ApiExceptionHandler {

    /** Over-length {@code pattern} / {@code text} / {@code replace} → HTTP 400 ProblemDetails. */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ProblemDetailsResponse> handleValidation(MethodArgumentNotValidException e) {
        Map<String, List<String>> errors = new LinkedHashMap<>();
        for (FieldError fieldError : e.getBindingResult().getFieldErrors()) {
            // An array of strings per field, even though Spring produces one message per violation:
            // the contract requires the array shape on every engine.
            errors.computeIfAbsent(fieldError.getField(), key -> new ArrayList<>())
                    .add(fieldError.getDefaultMessage());
        }
        return ResponseEntity.badRequest()
                .contentType(MediaType.APPLICATION_PROBLEM_JSON)
                .body(ProblemDetailsResponse.validation(errors));
    }

    /**
     * An unreadable body is normally malformed JSON (HTTP 400), but it is also how a body that
     * overflowed {@link MaxBodySizeFilter}'s streaming counter surfaces: Jackson is mid-read when
     * {@link BodyTooLargeException} is thrown, and Spring wraps it. Unwrap and report 413 so an
     * oversized body is never mistaken for a syntax error.
     */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ProblemDetailsResponse> handleUnreadableBody(HttpMessageNotReadableException e) {
        for (Throwable cause = e.getCause(); cause != null; cause = cause.getCause()) {
            if (cause instanceof BodyTooLargeException) {
                return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE)
                        .contentType(MediaType.APPLICATION_PROBLEM_JSON)
                        .body(ProblemDetailsResponse.payloadTooLarge(
                                MaxBodySizeFilter.MAX_REQUEST_BODY_BYTES));
            }
        }
        return ResponseEntity.badRequest()
                .contentType(MediaType.APPLICATION_PROBLEM_JSON)
                .body(ProblemDetailsResponse.validation(
                        Map.of("body", List.of("The request body could not be read as JSON."))));
    }

    /**
     * The 5-second request timeout. Contract §4 is explicit that this is <strong>HTTP 200</strong>
     * with an {@code error}-populated body — not 408, and not the 503 Spring would return by default
     * for an async timeout.
     */
    @ExceptionHandler(AsyncRequestTimeoutException.class)
    public ResponseEntity<RegexResult> handleTimeout(AsyncRequestTimeoutException e) {
        return ResponseEntity.ok(
                RegexResult.error("The request timed out (exceeded 5 seconds)."));
    }
}
