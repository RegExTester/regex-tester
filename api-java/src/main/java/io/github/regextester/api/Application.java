package io.github.regextester.api;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Entry point for api-java, the Java implementation of the canonical v1 RegEx Tester API
 * contract (see docs/design/api-contract.md).
 *
 * <p>Run from the api-java/ directory with:
 *
 * <pre>
 *   mvn spring-boot:run
 *   java -jar target/app.jar
 * </pre>
 *
 * <p>Listens on {@code PORT}, defaulting to 5300.
 */
@SpringBootApplication
public class Application {

    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }
}
