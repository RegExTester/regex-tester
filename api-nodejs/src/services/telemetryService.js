import { CosmosClient } from '@azure/cosmos';
import { randomUUID } from 'crypto';
import { ENGINE_KEY } from './capabilities.js';

let cosmosClient = null;
let cosmosContainer = null;

async function initCosmos(connectionString, database, container) {
  if (!connectionString || cosmosClient) return;

  cosmosClient = new CosmosClient(connectionString);
  const { database: db } = await cosmosClient.databases.createIfNotExists({
    id: database,
    throughput: 400,
  });
  const { container: cont } = await db.containers.createIfNotExists({
    id: container,
    partitionKey: { paths: ['/engineKey'] },
  });
  cosmosContainer = cont;
}

/**
 * Records one telemetry document for a completed `POST /api/regex` request. Fire-and-forget:
 * the Cosmos write is never awaited by the caller, and every error is swallowed here (logged at
 * warning level at most) so a Cosmos outage can never affect the HTTP response.
 *
 * @param {import('express').Request} req
 * @param {{pattern: string|null, text: string|null, replace: string|null, options: number}} model
 * @param {{durationMs: number, matchCount: number, error: string|null}} outcome
 */
function sendTelemetry(req, model, { durationMs, matchCount, error }) {
  if (!cosmosClient || !cosmosContainer) return;

  const item = {
    id: randomUUID(),
    engineKey: ENGINE_KEY,
    timestamp: new Date().toISOString(),
    host: req.get('host') || '',
    userAgent: req.get('user-agent') || '',
    pattern: model.pattern,
    text: model.text,
    replace: model.replace ?? null,
    options: model.options ?? 0,
    durationMs,
    matchCount,
    error,
  };

  cosmosContainer.items.create(item).catch(err => {
    console.warn('Telemetry write failed:', err.message);
  });
}

export const telemetryService = { initCosmos, sendTelemetry };

