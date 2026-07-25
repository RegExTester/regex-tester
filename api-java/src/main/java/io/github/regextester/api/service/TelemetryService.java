package io.github.regextester.api.service;

import com.azure.cosmos.CosmosClient;
import com.azure.cosmos.CosmosClientBuilder;
import com.azure.cosmos.CosmosContainer;
import com.azure.cosmos.CosmosDatabase;
import com.azure.cosmos.models.CosmosContainerProperties;
import com.azure.cosmos.models.ThroughputProperties;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Cosmos DB telemetry for api-java.
 *
 * <p>Mirrors the .NET, Node.js and Python implementations: silently disabled when
 * {@code COSMOS_CONNECTION_STRING} is empty, {@code /timestamp} partition key, the standardized
 * 12-field document, and strictly fire-and-forget so a Cosmos outage can never affect the
 * {@code POST /api/regex} response. api-dotnet once awaited its write, so an outage returned HTTP
 * 500 to users; do not reintroduce that here.
 *
 * <p>No client IP is ever collected — {@code host} is the Host header.
 */
@Service
public class TelemetryService {

    private static final Logger log = LoggerFactory.getLogger(TelemetryService.class);

    private final String connectionString;
    private final String databaseName;
    private final String containerName;

    /**
     * Single daemon thread: telemetry must never keep the JVM alive, and serializing writes bounds
     * the resource cost of a Cosmos slowdown to one thread instead of the request pool.
     */
    private final ExecutorService executor = Executors.newSingleThreadExecutor(runnable -> {
        Thread thread = new Thread(runnable, "telemetry");
        thread.setDaemon(true);
        return thread;
    });

    private volatile CosmosClient client;
    private volatile CosmosContainer container;

    public TelemetryService(
            @Value("${COSMOS_CONNECTION_STRING:}") String connectionString,
            @Value("${COSMOS_DATABASE:regex-tester-db}") String databaseName,
            @Value("${COSMOS_CONTAINER:telemetry}") String containerName) {
        this.connectionString = connectionString;
        this.databaseName = databaseName;
        this.containerName = containerName;
    }

    /**
     * Initialize the Cosmos client on a background thread. No-op when the connection string is
     * empty.
     *
     * <p>Deliberately off the startup thread, matching api-nodejs's unawaited {@code initCosmos}:
     * creating the database and container is a network round trip, and a bad or unreachable endpoint
     * must never delay — let alone prevent — the app from starting. Any failure is logged at warning
     * level and telemetry stays disabled for the lifetime of the process.
     */
    @PostConstruct
    void init() {
        if (connectionString == null || connectionString.isBlank()) {
            return;
        }
        executor.execute(() -> {
            try {
                CosmosClient built = buildClient(connectionString);
                built.createDatabaseIfNotExists(
                        databaseName, ThroughputProperties.createManualThroughput(400));
                CosmosDatabase database = built.getDatabase(databaseName);
                // Partitioned on /timestamp, which is effectively unique per document: writes spread
                // evenly and this matches containers created before telemetry was standardized.
                // Cosmos cannot change an existing container's partition key and
                // createContainerIfNotExists silently returns the existing one, so switching this
                // path would require operators to delete and recreate the container. Do not change it.
                database.createContainerIfNotExists(
                        new CosmosContainerProperties(containerName, "/timestamp"));
                this.container = database.getContainer(containerName);
                this.client = built;
            } catch (RuntimeException e) {
                log.warn("Cosmos DB telemetry initialization failed; telemetry is disabled.", e);
            }
        });
    }

    /**
     * Parse an {@code AccountEndpoint=...;AccountKey=...;} connection string.
     *
     * <p>The Java Cosmos SDK, unlike the .NET, JavaScript and Python ones, has no
     * connection-string factory on {@code CosmosClientBuilder}, so the same configuration value the
     * other three backends consume verbatim has to be split here.
     */
    private static CosmosClient buildClient(String connectionString) {
        String endpoint = null;
        String key = null;
        for (String part : connectionString.split(";")) {
            int separator = part.indexOf('=');
            if (separator < 0) {
                continue;
            }
            String name = part.substring(0, separator).trim();
            // Only split on the FIRST '=': a base64 account key routinely ends with padding '='.
            String value = part.substring(separator + 1).trim();
            if ("AccountEndpoint".equalsIgnoreCase(name)) {
                endpoint = value;
            } else if ("AccountKey".equalsIgnoreCase(name)) {
                key = value;
            }
        }
        if (endpoint == null || key == null) {
            throw new IllegalArgumentException(
                    "COSMOS_CONNECTION_STRING must contain AccountEndpoint and AccountKey.");
        }
        return new CosmosClientBuilder().endpoint(endpoint).key(key).buildClient();
    }

    /**
     * Build the standardized 12-field telemetry document. Pure function, no I/O — kept separate from
     * {@link #send} so the shape can be verified without a live Cosmos account.
     *
     * <p>A {@link LinkedHashMap} preserves field order in the stored document, matching the other
     * three engines.
     */
    public Map<String, Object> buildDocument(
            String host,
            String userAgent,
            String pattern,
            String text,
            String replace,
            int options,
            long durationMs,
            int matchCount,
            String error) {

        Map<String, Object> document = new LinkedHashMap<>();
        document.put("id", UUID.randomUUID().toString());
        document.put("engineKey", CapabilitiesService.ENGINE_KEY);
        document.put("timestamp", Instant.now().toString());
        document.put("host", host == null ? "" : host);
        document.put("userAgent", userAgent == null ? "" : userAgent);
        document.put("pattern", pattern);
        document.put("text", text);
        document.put("replace", replace);
        document.put("options", options);
        document.put("durationMs", durationMs);
        document.put("matchCount", matchCount);
        document.put("error", error);
        return document;
    }

    /**
     * Write a pre-built document to Cosmos.
     *
     * <p>Fire-and-forget: the caller never blocks on it, and every exception is swallowed here. The
     * SDK reads the partition key from the document body, so — like api-nodejs and api-python, and
     * unlike api-dotnet — no explicit partition key value is passed.
     */
    public void send(Map<String, Object> document) {
        CosmosContainer target = container;
        if (target == null) {
            return;
        }
        executor.execute(() -> {
            try {
                target.createItem(document);
            } catch (RuntimeException e) {
                log.warn("Telemetry write to Cosmos DB failed: {}", e.getMessage());
            }
        });
    }

    @PreDestroy
    void shutdown() {
        executor.shutdownNow();
        CosmosClient open = client;
        if (open != null) {
            open.close();
        }
    }
}
