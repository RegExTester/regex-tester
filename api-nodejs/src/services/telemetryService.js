import { CosmosClient } from '@azure/cosmos';
import { randomUUID } from 'crypto';

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
    partitionKey: { paths: ['/timestamp'] },
  });
  cosmosContainer = cont;
}

async function sendTelemetry(req, model) {
  if (!cosmosClient || !cosmosContainer) return;

  const timestamp = new Date().toISOString();
  const item = {
    id: randomUUID(),
    timestamp,
    host: req.get('host') || '',
    useragent: req.get('user-agent') || '',
    pattern: model.pattern,
    text: model.text,
    replace: model.replace,
    options: String(model.options ?? 0),
  };

  await cosmosContainer.items.create(item);
}

export const telemetryService = { initCosmos, sendTelemetry };
