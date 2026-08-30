package io.github.regextester.api;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.regextester.api.model.Input;
import io.github.regextester.api.model.ProblemDetailsResponse;
import io.github.regextester.api.model.RegexResult;
import io.github.regextester.api.service.CapabilitiesService;
import io.github.regextester.api.service.RegexProcessor;
import io.github.regextester.api.service.TelemetryService;
import io.javalin.Javalin;
import io.javalin.http.Context;
import io.javalin.http.HttpResponseException;
import io.javalin.http.HttpStatus;
import io.javalin.json.JavalinJackson;
import io.javalin.openapi.HttpMethod;
import io.javalin.openapi.OpenApi;
import io.javalin.openapi.OpenApiContent;
import io.javalin.openapi.OpenApiRequestBody;
import io.javalin.openapi.OpenApiResponse;
import io.javalin.openapi.plugin.OpenApiPlugin;
import io.javalin.openapi.plugin.swagger.SwaggerPlugin;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/**
 * Entry point and HTTP layer.
 *
 * <p>Replaces Spring Boot with Javalin: measured 0.63 s to listening against Spring's 2.31 s for the
 * identical contract. Everything Spring used to supply declaratively is explicit here, because each
 * piece encodes a contract rule the conformance suite checks — CORS that never emits {@code *},
 * validation shaped as {@code errors: { field: string[] }}, a request timeout that returns HTTP 200,
 * and a 413 raised before the body is parsed. See docs/plan/2026-08-30-api-java-javalin.md.
 */
public final class App {

    /** Contract §5. Enforced before the body is parsed, so an oversized body is 413 and never 400. */
    public static final int MAX_REQUEST_BODY_BYTES = 8192;

    private static final int PATTERN_MAX_LENGTH = 512;
    private static final int TEXT_MAX_LENGTH = 1024;
    private static final int REPLACE_MAX_LENGTH = 1024;

    /** Contract §4: on expiry the response is HTTP 200 with an {@code error} body, never 408. */
    public static final int REQUEST_TIMEOUT_MS = 5_000;

    private static final int DEFAULT_PORT = 5300;
    private static final String FRONTEND_ORIGIN = "https://regextester.github.io";
    private static final String PROBLEM_JSON = "application/problem+json";

    private static final RegexProcessor REGEX_PROCESSOR = new RegexProcessor();
    private static final CapabilitiesService CAPABILITIES = new CapabilitiesService();

    private static TelemetryService telemetryService;

    /**
     * Daemon threads so the 5 s bound can be applied without keeping the JVM alive, and so a
     * runaway match cannot block shutdown.
     */
    private static final ExecutorService WORKERS = Executors.newCachedThreadPool(runnable -> {
        Thread thread = new Thread(runnable, "regex");
        thread.setDaemon(true);
        return thread;
    });

    public static void main(String[] args) {
        telemetryService = new TelemetryService(
                env("COSMOS_ENDPOINT", ""),
                env("COSMOS_DATABASE", "regex-tester-db"),
                env("COSMOS_CONTAINER", "telemetry"));
        // Blocking and bounded, on the startup path: the first request after a restart must be
        // recorded. Never throws — a broken sink can only disable telemetry, never startup.
        telemetryService.init();
        Runtime.getRuntime().addShutdownHook(new Thread(telemetryService::shutdown));

        List<String> allowedOrigins = allowedOrigins();
        boolean allowLocalhost = !"production".equalsIgnoreCase(env("ENVIRONMENT", "development").trim());

        Javalin app = Javalin.create(config -> {
            config.showJavalinBanner = false;
            // Jackson's default inclusion is ALWAYS; the contract requires every field to be
            // emitted and `matches` to be [] rather than null, so no inclusion filter is set.
            config.jsonMapper(new JavalinJackson(new ObjectMapper(), false));
            config.http.maxRequestSize = MAX_REQUEST_BODY_BYTES;
            config.registerPlugin(new OpenApiPlugin(openApi ->
                    openApi.withDocumentationPath("/openapi/v1.json")
                            .withDefinitionConfiguration((version, definition) ->
                                    definition.withInfo(info -> {
                                        info.setTitle("RegEx Tester API");
                                        info.setVersion("1.0");
                                        info.setDescription(
                                                "REST API for testing Java regular expressions using"
                                                        + " java.util.regex.");
                                    }))));
            config.registerPlugin(new SwaggerPlugin(swagger -> {
                swagger.setUiPath("/scalar/v1");
                swagger.setDocumentationPath("/openapi/v1.json");
            }));
        });

        app.before(context -> applyCors(context, allowedOrigins, allowLocalhost));
        app.options("/*", context -> context.status(HttpStatus.OK));

        app.get("/", App::redirectToFrontend);
        app.get("/api/capabilities", App::capabilities);
        app.post("/api/regex", App::regex);

        // Javalin raises its own 413 once maxRequestSize is exceeded; replace the plain-text body
        // with the contract's RFC 9457 ProblemDetails shape.
        app.error(HttpStatus.CONTENT_TOO_LARGE.getCode(), context ->
                context.contentType(PROBLEM_JSON)
                        .json(ProblemDetailsResponse.payloadTooLarge(MAX_REQUEST_BODY_BYTES)));

        app.start(Integer.parseInt(env("PORT", String.valueOf(DEFAULT_PORT))));
    }

    @OpenApi(
            path = "/",
            methods = HttpMethod.GET,
            operationId = "root",
            tags = {"Home"},
            summary = "Redirect to the frontend",
            responses = @OpenApiResponse(
                    status = "302",
                    description = "Redirect to https://regextester.github.io/"))
    private static void redirectToFrontend(Context context) {
        context.redirect(FRONTEND_ORIGIN + "/", HttpStatus.FOUND);
    }

    @OpenApi(
            path = "/api/capabilities",
            methods = HttpMethod.GET,
            operationId = "capabilities",
            tags = {"Capabilities"},
            summary = "Report engine identity and the options, limits, and features this engine supports",
            responses = @OpenApiResponse(
                    status = "200",
                    description = "Capability document (cacheable for 24 hours)",
                    content = @OpenApiContent(from = io.github.regextester.api.model.Capabilities.class)))
    private static void capabilities(Context context) {
        context.header("Cache-Control", "public, max-age=86400");
        context.json(CAPABILITIES.get());
    }

    @OpenApi(
            path = "/api/regex",
            methods = HttpMethod.POST,
            operationId = "regex",
            tags = {"RegEx"},
            summary = "Run a regular expression against input text",
            requestBody = @OpenApiRequestBody(
                    required = true, content = @OpenApiContent(from = Input.class)),
            responses = {
                @OpenApiResponse(
                        status = "200",
                        description = "Match results. Regex errors and both timeouts are also reported"
                                + " here, via the `error` field — never as an HTTP error status.",
                        content = @OpenApiContent(from = RegexResult.class)),
                @OpenApiResponse(
                        status = "400",
                        description = "A field exceeded its maximum length",
                        content = @OpenApiContent(
                                from = ProblemDetailsResponse.class, mimeType = PROBLEM_JSON)),
                @OpenApiResponse(
                        status = "413",
                        description = "Raw request body exceeded maxRequestBodyBytes (8192)",
                        content = @OpenApiContent(
                                from = ProblemDetailsResponse.class, mimeType = PROBLEM_JSON))
            })
    private static void regex(Context context) {
        Input input;
        try {
            input = context.bodyAsClass(Input.class);
        } catch (HttpResponseException e) {
            // Javalin enforces maxRequestSize by throwing while the body is read, i.e. from inside
            // this same call. Rethrow so the 413 mapper runs: swallowing it below would report an
            // oversized body as a JSON syntax error (400), which the conformance suite catches.
            throw e;
        } catch (Exception e) {
            problem(context, HttpStatus.BAD_REQUEST, ProblemDetailsResponse.validation(
                    Map.of("body", List.of("The request body could not be read as JSON."))));
            return;
        }

        Map<String, List<String>> errors = validate(input);
        if (!errors.isEmpty()) {
            problem(context, HttpStatus.BAD_REQUEST, ProblemDetailsResponse.validation(errors));
            return;
        }

        String host = context.header("Host");
        String userAgent = context.header("User-Agent");

        // Run off the request thread purely so the 5 s bound can be applied. RegexProcessor
        // enforces its own 15 s match deadline independently.
        Future<RegexResult> task = WORKERS.submit(() -> REGEX_PROCESSOR.match(
                input.pattern(), input.text(), input.replace(), input.options()));

        long start = System.nanoTime();
        RegexResult result;
        try {
            result = task.get(REQUEST_TIMEOUT_MS, TimeUnit.MILLISECONDS);
        } catch (TimeoutException e) {
            task.cancel(true);
            context.json(RegexResult.error("The request timed out (exceeded 5 seconds)."));
            return;
        } catch (Exception e) {
            context.json(RegexResult.error(e.getMessage()));
            return;
        }
        long durationMs = (System.nanoTime() - start) / 1_000_000L;

        // Fire-and-forget: send() queues onto a daemon thread and swallows every error, so a
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

        context.json(result);
    }

    /**
     * Replaces Spring's {@code @Valid}/{@code @Size}. Each field maps to an <em>array</em> of
     * messages even though only one violation is possible, because the contract requires that shape
     * on every engine.
     */
    private static Map<String, List<String>> validate(Input input) {
        Map<String, List<String>> errors = new LinkedHashMap<>();
        checkLength(errors, "pattern", input.pattern(), PATTERN_MAX_LENGTH);
        checkLength(errors, "text", input.text(), TEXT_MAX_LENGTH);
        checkLength(errors, "replace", input.replace(), REPLACE_MAX_LENGTH);
        return errors;
    }

    private static void checkLength(
            Map<String, List<String>> errors, String field, String value, int max) {
        if (value != null && value.length() > max) {
            errors.computeIfAbsent(field, key -> new ArrayList<>()).add(
                    "The field " + field + " must be a string with a maximum length of " + max + ".");
        }
    }

    private static void problem(Context context, HttpStatus status, ProblemDetailsResponse body) {
        context.status(status).contentType(PROBLEM_JSON).json(body);
    }

    private static List<String> allowedOrigins() {
        List<String> origins = new ArrayList<>();
        origins.add(FRONTEND_ORIGIN);
        for (String origin : env("ALLOW_CORS", "").split(",")) {
            String trimmed = origin.trim();
            if (!trimmed.isEmpty()) {
                origins.add(trimmed);
            }
        }
        return origins;
    }

    /**
     * Contract §4.3: never {@code Access-Control-Allow-Origin: *}, in any environment — the specific
     * requesting origin is reflected, and a disallowed origin receives no header at all.
     *
     * <p>Runs as a {@code before} handler so error responses carry CORS headers too, which is why
     * Spring used a highest-precedence {@code CorsFilter} rather than MVC mappings.
     */
    private static void applyCors(Context context, List<String> allowed, boolean allowLocalhost) {
        String origin = context.header("Origin");
        if (origin == null) {
            return;
        }
        boolean permitted = allowed.contains(origin)
                || (allowLocalhost && origin.matches("^https?://localhost(:\\d+)?$"));
        if (!permitted) {
            return;
        }
        context.header("Access-Control-Allow-Origin", origin);
        context.header("Vary", "Origin");
        context.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        context.header("Access-Control-Allow-Headers", "Content-Type");
    }

    private static String env(String name, String fallback) {
        String value = System.getenv(name);
        return value == null || value.isBlank() ? fallback : value;
    }

    private App() {
    }
}
