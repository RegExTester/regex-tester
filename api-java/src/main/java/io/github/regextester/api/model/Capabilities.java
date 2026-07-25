package io.github.regextester.api.model;

import java.util.List;

/**
 * Response body for {@code GET /api/capabilities}.
 *
 * @param runtime diagnostic/support information only — clients MUST NOT use it for feature
 *     detection; that is what {@code features} and {@code options} are for.
 */
public record Capabilities(
        String engineKey,
        String engineName,
        String contractVersion,
        Runtime runtime,
        int defaultOptions,
        Limits limits,
        Features features,
        List<CapabilityOption> options) {

    /** Diagnostic host/runtime information. */
    public record Runtime(String os, String framework) {
    }

    /** The enforced limits, which must match what the code actually enforces. */
    public record Limits(
            int patternMaxLength,
            int textMaxLength,
            int replaceMaxLength,
            int regexTimeoutMs,
            int requestTimeoutMs,
            int maxRequestBodyBytes) {
    }

    /** @param captures "single", "multi" or "none". */
    public record Features(boolean replace, boolean namedGroups, String captures) {
    }

    /**
     * One entry of the shared option registry.
     *
     * @param flag the native engine flag name, or null when this engine has no equivalent
     * @param supported false means the bit is accepted and silently ignored, never rejected
     */
    public record CapabilityOption(
            int value,
            String name,
            String flag,
            boolean supported,
            String description) {
    }
}
