package io.github.regextester.api.controller;

import io.github.regextester.api.model.Input;
import io.github.regextester.api.model.ProblemDetailsResponse;
import io.github.regextester.api.model.RegexResult;
import io.github.regextester.api.service.RegexProcessor;
import io.github.regextester.api.service.TelemetryService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.concurrent.Callable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** {@code POST /api/regex}. */
@RestController
public class RegexController {

    private final RegexProcessor regexProcessor;
    private final TelemetryService telemetryService;

    public RegexController(RegexProcessor regexProcessor, TelemetryService telemetryService) {
        this.regexProcessor = regexProcessor;
        this.telemetryService = telemetryService;
    }

    /**
     * Returns a {@link Callable} so Spring MVC runs the work asynchronously and applies
     * {@code spring.mvc.async.request-timeout} (5 s) to it. On expiry Spring raises
     * {@code AsyncRequestTimeoutException}, which {@link ApiExceptionHandler} converts into HTTP 200
     * with an {@code error}-populated body — never 408, and never Spring's default 503.
     *
     * <p>The header values are read here, on the request thread, because the request is no longer
     * available once the async dispatch completes.
     */
    @PostMapping("/api/regex")
    @Tag(name = "RegEx")
    @Operation(summary = "Run a regular expression against input text")
    @ApiResponses({
        @ApiResponse(
                responseCode = "200",
                description =
                        "Match results. Regex errors and both timeouts are also reported here, via"
                                + " the `error` field — never as an HTTP error status.",
                content = @Content(schema = @Schema(implementation = RegexResult.class))),
        @ApiResponse(
                responseCode = "400",
                description = "A field exceeded its maximum length",
                content =
                        @Content(
                                mediaType = "application/problem+json",
                                schema = @Schema(implementation = ProblemDetailsResponse.class))),
        @ApiResponse(
                responseCode = "413",
                description = "Raw request body exceeded maxRequestBodyBytes (8192)",
                content =
                        @Content(
                                mediaType = "application/problem+json",
                                schema = @Schema(implementation = ProblemDetailsResponse.class)))
    })
    public Callable<RegexResult> post(@Valid @RequestBody Input input, HttpServletRequest request) {
        String host = request.getHeader("Host");
        String userAgent = request.getHeader("User-Agent");

        return () -> {
            long start = System.nanoTime();
            RegexResult result =
                    regexProcessor.match(input.pattern(), input.text(), input.replace(), input.options());
            long durationMs = (System.nanoTime() - start) / 1_000_000L;

            // Fire-and-forget: send() queues onto a daemon executor and swallows every error, so a
            // Cosmos outage can never affect this response.
            telemetryService.send(telemetryService.buildDocument(
                    host,
                    userAgent,
                    input.pattern(),
                    input.text(),
                    input.replace(),
                    input.options(),
                    durationMs,
                    result.matches().size(),
                    result.error()));

            return result;
        };
    }
}
