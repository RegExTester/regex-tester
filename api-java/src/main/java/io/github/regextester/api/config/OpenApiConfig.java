package io.github.regextester.api.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * OpenAPI document metadata.
 *
 * <p>The document is served at {@code /openapi/v1.json} and the explorer at {@code /scalar/v1};
 * both paths are configured in {@code application.properties}, as every backend must expose them
 * (contract §2).
 */
@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI regexTesterOpenApi() {
        return new OpenAPI()
                .info(new Info()
                        .title("RegEx Tester API")
                        .description("REST API for testing Java regular expressions using java.util.regex.")
                        .version("1.0"));
    }
}
