package io.github.regextester.api.service;

import com.azure.cosmos.CosmosClient;
import com.azure.cosmos.CosmosClientBuilder;
import com.azure.cosmos.CosmosContainer;
import com.azure.identity.DefaultAzureCredentialBuilder;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Cosmos DB telemetry for api-java.
 *
 * <p>Mirrors the .NET, Node.js and Python implementations: Entra ID authentication via
 * {@code DefaultAzureCredential} with no account key anywhere, silently disabled when
 * {@code COSMOS_ENDPOINT} is empty, {@code /timestamp} partition key, the standardized
 * 12-field document, and strictly fire-and-forget so a Cosmos outage can never affect the
 * {@code POST /api/regex} response. api-dotnet once awaited its write, so an outage returned HTTP
 * 500 to users; do not reintroduce that here.
 *
 * <p>No client IP is ever collected — {@code host} is the Host header.
 */
public class TelemetryService {

    private static final Logger log = LoggerFactory.getLogger(TelemetryService.class);

    private final String endpoint;
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

    /**
     * Upper bound on Cosmos initialization. Init blocks the startup thread, so an unreachable
     * endpoint would otherwise hang startup and turn a telemetry outage into a total outage.
     */
    private static final long INIT_TIMEOUT_MS = 10_000;

    private volatile CosmosClient client;
    private volatile CosmosContainer container;

    public TelemetryService(String endpoint, String databaseName, String containerName) {
        this.endpoint = endpoint;
        this.databaseName = databaseName;
        this.containerName = containerName;
    }

    /**
     * Initialize the Cosmos client during startup. No-op when the endpoint is empty.
     *
     * <p>Blocks the startup thread until the client is ready, so the very first {@code
     * POST /api/regex} after a restart is recorded rather than silently dropped — App Service
     * restarts instances routinely, so a warm-up window is continuous data loss, not an edge case.
     *
     * <p>The work runs on the telemetry executor purely so {@link Future#get(long, TimeUnit)} can
     * bound it: the Java Cosmos SDK offers no per-call timeout for these operations. On timeout the
     * abandoned attempt is left to finish on its own; if it eventually succeeds it legitimately
     * leaves a usable client behind. Any failure is logged at warning level and leaves telemetry
     * disabled — a bad or unreachable endpoint, a missing role assignment or an unavailable
     * credential must never prevent the app from starting.
     */
    public void init() {
        if (endpoint == null || endpoint.isBlank()) {
            return;
        }
        Future<?> initTask = executor.submit(() -> {
            // Entra ID, never an account key: DefaultAzureCredential resolves the App Service
            // managed identity in Azure and the developer's az login session locally. A rotated
            // key silently disabled telemetry for five weeks in 2026-07; there is now no key.
            CosmosClient built = new CosmosClientBuilder()
                    .endpoint(endpoint)
                    .credential(new DefaultAzureCredentialBuilder().build())
                    .buildClient();
            CosmosContainer cont = built.getDatabase(databaseName).getContainer(containerName);

            // getDatabase/getContainer only build client-side handles, so without this read the
            // first token acquisition — and any 403 from a missing role assignment — would be
            // deferred to the first write and lost in its catch. One metadata round trip here
            // proves the identity can reach the container, and is covered by the readMetadata
            // action of Cosmos DB Built-in Data Contributor. It replaces the two
            // createIfNotExists calls, which that role deliberately cannot perform: creating a
            // database or container is a control-plane operation. The container is provisioned by
            // DEPLOYMENT.md §2 and must already exist, partitioned on /timestamp.
            cont.read();

            this.container = cont;
            this.client = built;
        });

        try {
            initTask.get(INIT_TIMEOUT_MS, TimeUnit.MILLISECONDS);
        } catch (TimeoutException e) {
            log.warn("Cosmos DB telemetry initialization timed out after {} ms; telemetry is disabled.",
                    INIT_TIMEOUT_MS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.warn("Cosmos DB telemetry initialization was interrupted; telemetry is disabled.");
        } catch (Exception e) {
            log.warn("Cosmos DB telemetry initialization failed; telemetry is disabled.", e);
        }
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

    public void shutdown() {
        executor.shutdownNow();
        CosmosClient open = client;
        if (open != null) {
            open.close();
        }
    }
}
