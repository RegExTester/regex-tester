package io.github.regextester.api.service;

import io.github.regextester.api.App;
import io.github.regextester.api.model.Capabilities;
import io.github.regextester.api.options.RegexOptions;

/** Builds the capability document for {@code GET /api/capabilities}. */
public class CapabilitiesService {

    /**
     * The single source of truth for this engine's identifier, reported by
     * {@code GET /api/capabilities} and reused unchanged by {@link TelemetryService} so the two can
     * never drift apart.
     */
    public static final String ENGINE_KEY = "JAVA";

    public static final String ENGINE_NAME = "Java";

    /** The HTTP request timeout, mirrored from {@link App#REQUEST_TIMEOUT_MS}. */
    public static final int REQUEST_TIMEOUT_MS = App.REQUEST_TIMEOUT_MS;

    public Capabilities get() {
        return new Capabilities(
                ENGINE_KEY,
                ENGINE_NAME,
                "1.0",
                new Capabilities.Runtime(
                        System.getProperty("os.name") + " " + System.getProperty("os.version") + " "
                                + System.getProperty("os.arch"),
                        "Java " + System.getProperty("java.version")),
                RegexOptions.DEFAULT_OPTIONS,
                new Capabilities.Limits(
                        512,
                        1024,
                        1024,
                        RegexProcessor.REGEX_TIMEOUT_MS,
                        REQUEST_TIMEOUT_MS,
                        App.MAX_REQUEST_BODY_BYTES),
                // "single": java.util.regex.Matcher only exposes the last capture of a repeated
                // group. Only api-dotnet, via Group.Captures, reports "multi".
                new Capabilities.Features(true, true, "single"),
                RegexOptions.REGISTRY);
    }
}
