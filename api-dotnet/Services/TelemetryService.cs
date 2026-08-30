using Azure.Identity;
using Microsoft.AspNetCore.Http;
using Microsoft.Azure.Cosmos;
using Microsoft.Extensions.Logging;
using RegExTester.Api.DotNet.Models;
using System;
using System.Threading;
using System.Threading.Tasks;

namespace RegExTester.Api.DotNet.Services;


public interface ITelemetryService
{
    /// <summary>
    /// Records one telemetry document for a completed <c>POST /api/regex</c> request.
    /// Fire-and-forget: dispatches the Cosmos write on a background task and returns
    /// immediately, so a Cosmos outage can never delay or fail the HTTP response.
    /// </summary>
    void RecordTelemetry(HttpRequest request, Input model, TimeSpan duration, int matchCount, string error);
}

public class TelemetryService : ITelemetryService, IDisposable
{
    public static ItemRequestOptions ItemRequestOptions = new ItemRequestOptions { EnableContentResponseOnWrite = false };

    /// <summary>
    /// Upper bound on Cosmos initialization. Init runs on the startup path, so an unreachable
    /// endpoint would otherwise hang startup and turn a telemetry outage into a total outage.
    /// </summary>
    private static readonly TimeSpan InitTimeout = TimeSpan.FromSeconds(10);

    public static CosmosClient CosmosClient { get; private set; }
    public static Database CosmosDatabase { get; private set; }
    public static Container CosmosContainer { get; private set; }

    private readonly ILogger<TelemetryService> _logger;

    public TelemetryService(string cosmosEndpoint, string database, string container, ILogger<TelemetryService> logger)
    {
        _logger = logger;
        InitCosmos(cosmosEndpoint, database, container);
    }

    public void RecordTelemetry(HttpRequest request, Input model, TimeSpan duration, int matchCount, string error)
    {
        if (CosmosClient is null || CosmosContainer is null)
            return;

        var item = new
        {
            id = Guid.NewGuid().ToString(),
            engineKey = RegExTesterOptionsRegistry.EngineKey,
            timestamp = DateTime.UtcNow.ToString("o"),
            host = request.Host.Value,
            userAgent = request.Headers["User-Agent"].ToString(),
            pattern = model.Pattern,
            text = model.Text,
            replace = model.Replace,
            options = (int)model.Options,
            durationMs = (int)duration.TotalMilliseconds,
            matchCount,
            error
        };

        // Fire-and-forget: never awaited by the caller, and CancellationToken.None is used
        // (not the request's token, which may already be cancelled by the time the response
        // has been sent). Every exception is caught inside this task so none can escape as an
        // unobserved task exception, and telemetry can never affect a response already sent.
        _ = Task.Run(async () =>
        {
            try
            {
                // The partition key value MUST match the provisioned container's partition key
                // path (/timestamp). Passing engineKey here would make every write fail with
                // PartitionKeyMismatch, and because this catch swallows everything that failure
                // would be completely silent.
                await CosmosContainer.CreateItemAsync(item, new PartitionKey(item.timestamp), ItemRequestOptions, CancellationToken.None);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Telemetry write to Cosmos DB failed.");
            }
        });
    }

    private void InitCosmos(string cosmosEndpoint, string database, string container)
    {
        if (string.IsNullOrEmpty(cosmosEndpoint) || CosmosClient is not null)
            return;

        // Bounded out here rather than with a CancellationToken: the Cosmos SDK does not honour one
        // promptly against an unreachable endpoint (measured at ~37s against a blackholed address,
        // versus the 10s asked for). A connection that completes after the bound still publishes
        // its client — it is perfectly usable, it just missed the startup window.
        var init = Task.Run(() => ConnectAsync(cosmosEndpoint, database, container));

        if (!init.Wait(InitTimeout))
        {
            _logger?.LogWarning(
                "Cosmos DB telemetry initialization exceeded {TimeoutMs} ms; starting without it.",
                InitTimeout.TotalMilliseconds);
        }
    }

    private async Task ConnectAsync(string cosmosEndpoint, string database, string container)
    {
        CosmosClient client = null;
        try
        {
            // Entra ID, never an account key: DefaultAzureCredential resolves the App Service
            // managed identity in Azure and the developer's az login session locally. A rotated
            // key silently disabled telemetry for five weeks in 2026-07; there is now no key.
            client = new CosmosClient(cosmosEndpoint, new DefaultAzureCredential());
            var db = client.GetDatabase(database);
            var cont = db.GetContainer(container);

            // GetDatabase/GetContainer only build client-side handles, so without this read the
            // first token acquisition — and any 403 from a missing role assignment — would be
            // deferred to the first write and lost in its catch. One metadata round trip here
            // proves the identity can reach the container, and is covered by the readMetadata
            // action of Cosmos DB Built-in Data Contributor. It replaces the two
            // CreateIfNotExists calls, which that role deliberately cannot perform: creating a
            // database or container is a control-plane operation. The container is provisioned
            // by DEPLOYMENT.md §2 and must already exist, partitioned on /timestamp.
            await cont.ReadContainerAsync();

            // Published only once the round trip succeeded, so a partially initialized client is
            // never visible to RecordTelemetry.
            CosmosClient = client;
            CosmosDatabase = db;
            CosmosContainer = cont;
        }
        catch (Exception ex)
        {
            // Telemetry is non-essential: a bad, unreachable or slow endpoint, a missing role
            // assignment or an unavailable credential must never prevent the app from starting.
            // Log and leave telemetry disabled. Caught inside the task so a post-timeout failure
            // never surfaces as an unobserved task exception.
            _logger?.LogWarning(ex, "Cosmos DB telemetry initialization failed; telemetry is disabled.");
            client?.Dispose();
        }
    }

    public void Dispose()
    {
        CosmosContainer = null;
        CosmosDatabase = null;
        CosmosClient?.Dispose();
    }
}
