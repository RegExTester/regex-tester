package io.github.regextester.api.controller;

import io.github.regextester.api.model.Capabilities;
import io.github.regextester.api.service.CapabilitiesService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.net.URI;
import java.util.concurrent.TimeUnit;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** {@code GET /} and {@code GET /api/capabilities}. */
@RestController
public class HomeController {

    private static final URI FRONTEND = URI.create("https://regextester.github.io/");

    private final CapabilitiesService capabilitiesService;

    public HomeController(CapabilitiesService capabilitiesService) {
        this.capabilitiesService = capabilitiesService;
    }

    @GetMapping("/")
    @Tag(name = "Home")
    @Operation(summary = "Redirect to the frontend")
    @ApiResponse(
            responseCode = "302",
            description = "Redirect to https://regextester.github.io/",
            content = @Content)
    public ResponseEntity<Void> root() {
        // 302 (FOUND), not 301/308: the contract pins the status code, and every backend agrees.
        return ResponseEntity.status(HttpStatus.FOUND).location(FRONTEND).build();
    }

    @GetMapping("/api/capabilities")
    @Tag(name = "Capabilities")
    @Operation(summary = "Report engine identity and the options, limits, and features this engine supports")
    @ApiResponse(
            responseCode = "200",
            description = "Capability document (cacheable for 24 hours)",
            content = @Content(schema = @Schema(implementation = Capabilities.class)))
    public ResponseEntity<Capabilities> capabilities() {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(24, TimeUnit.HOURS).cachePublic())
                .body(capabilitiesService.get());
    }
}
