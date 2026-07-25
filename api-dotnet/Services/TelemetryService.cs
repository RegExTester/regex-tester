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

    public static CosmosClient CosmosClient { get; private set; }
    public static Database CosmosDatabase { get; private set; }
    public static Container CosmosContainer { get; private set; }

    private readonly ILogger<TelemetryService> _logger;

    public TelemetryService(string cosmosConnectionString, string database, string container, ILogger<TelemetryService> logger)
    {
        _logger = logger;
        InitCosmos(cosmosConnectionString, database, container);
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
                await CosmosContainer.CreateItemAsync(item, new PartitionKey(item.engineKey), ItemRequestOptions, CancellationToken.None);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Telemetry write to Cosmos DB failed.");
            }
        });
    }

    private void InitCosmos(string cosmosConnectionString, string database, string container)
    {
        if (string.IsNullOrEmpty(cosmosConnectionString) || CosmosClient is not null)
            return;

        try
        {
            CosmosClient = new CosmosClient(cosmosConnectionString);
            CosmosDatabase = CosmosClient.CreateDatabaseIfNotExistsAsync(database, ThroughputProperties.CreateManualThroughput(400)).Result.Database;
            CosmosContainer = CosmosDatabase.CreateContainerIfNotExistsAsync(container, "/engineKey").Result.Container;
        }
        catch (Exception ex)
        {
            // Telemetry is non-essential: a bad or unreachable connection string must never
            // prevent the app from starting. Log and leave telemetry disabled.
            _logger?.LogWarning(ex, "Cosmos DB telemetry initialization failed; telemetry is disabled.");
            CosmosClient = null;
            CosmosDatabase = null;
            CosmosContainer = null;
        }
    }

    public void Dispose()
    {
        CosmosContainer = null;
        CosmosDatabase = null;
        CosmosClient?.Dispose();
    }
}
