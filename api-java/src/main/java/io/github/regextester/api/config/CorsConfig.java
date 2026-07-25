package io.github.regextester.api.config;

import java.util.ArrayList;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;

/**
 * CORS policy.
 *
 * <p>Contract §4 and §4.3: never {@code Access-Control-Allow-Origin: *}, in any environment. Allow
 * the hosted frontend plus a configurable allow-list, and reflect {@code http(s)://localhost[:port]}
 * only outside production. {@code allowedOriginPatterns} reflects the <em>specific</em> requesting
 * origin, so a disallowed origin receives no header at all.
 *
 * <p>Registered as a {@link CorsFilter} at {@link Ordered#HIGHEST_PRECEDENCE} rather than through
 * {@code WebMvcConfigurer#addCorsMappings}, so that responses produced by the filter chain — notably
 * the 413 from {@code MaxBodySizeFilter} — still carry CORS headers. Mapping-based CORS is applied
 * inside the {@code DispatcherServlet}, which those responses never reach.
 */
@Configuration
public class CorsConfig {

    private static final String FRONTEND_ORIGIN = "https://regextester.github.io";

    @Bean
    public FilterRegistrationBean<CorsFilter> corsFilter(
            // Defaults to "development" so a plain local `java -jar` run allows the local frontend
            // origin, matching api-nodejs, api-dotnet and api-python. Deployments must set
            // ENVIRONMENT=production explicitly — no workflow sets it (see DEPLOYMENT.md §3) —
            // which restricts CORS to the configured allow-list only.
            @Value("${ENVIRONMENT:development}") String environment,
            @Value("${ALLOW_CORS:}") String allowCors) {

        List<String> originPatterns = new ArrayList<>();
        originPatterns.add(FRONTEND_ORIGIN);
        for (String origin : allowCors.split(",")) {
            String trimmed = origin.trim();
            if (!trimmed.isEmpty()) {
                originPatterns.add(trimmed);
            }
        }
        if (!"production".equalsIgnoreCase(environment.trim())) {
            // `[*]` is Spring's port wildcard; the bare hosts cover a default-port localhost.
            originPatterns.add("http://localhost");
            originPatterns.add("https://localhost");
            originPatterns.add("http://localhost:[*]");
            originPatterns.add("https://localhost:[*]");
        }

        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOriginPatterns(originPatterns);
        configuration.setAllowedMethods(List.of("GET", "POST", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("Content-Type"));

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);

        FilterRegistrationBean<CorsFilter> registration =
                new FilterRegistrationBean<>(new CorsFilter(source));
        registration.setOrder(Ordered.HIGHEST_PRECEDENCE);
        return registration;
    }
}
