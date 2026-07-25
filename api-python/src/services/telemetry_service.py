"""Cosmos DB telemetry for api-python.

Mirrors the .NET (`TelemetryService`) and Node.js (`telemetryService`) implementations: lazy
client init, silently disabled when `COSMOS_CONNECTION_STRING` is empty, `/timestamp` partition
key, and fire-and-forget so a Cosmos outage can never affect the `POST /api/regex` response.
Because FastAPI's route handler is synchronous, the write itself is dispatched as a
`BackgroundTasks` callable (see `routers/regex.py`) rather than awaited on the request path.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from azure.cosmos import CosmosClient, PartitionKey

from .capabilities import ENGINE_KEY

logger = logging.getLogger(__name__)

_cosmos_client: Optional[CosmosClient] = None
_cosmos_container = None


def init_cosmos(connection_string: str, database: str, container: str) -> None:
    """Initialize the Cosmos client/database/container. No-op when `connection_string` is
    empty. Never raises: a bad or unreachable connection string must not prevent the app
    from starting, so any failure here is logged at warning level and telemetry stays
    disabled for the lifetime of the process."""
    global _cosmos_client, _cosmos_container
    if not connection_string or _cosmos_client is not None:
        return

    try:
        client = CosmosClient.from_connection_string(connection_string)
        db = client.create_database_if_not_exists(id=database, offer_throughput=400)
        # Partitioned on /timestamp, which is effectively unique per document: writes spread
        # evenly and this matches containers created before telemetry was standardized. Cosmos
        # cannot change an existing container's partition key and create_container_if_not_exists
        # silently returns the existing one, so switching this path would require operators to
        # delete and recreate the container. Do not change it.
        _cosmos_container = db.create_container_if_not_exists(
            id=container,
            partition_key=PartitionKey(path="/timestamp"),
        )
        _cosmos_client = client
    except Exception:  # noqa: BLE001 - telemetry init must never crash startup
        logger.warning("Cosmos DB telemetry initialization failed; telemetry is disabled.", exc_info=True)
        _cosmos_client = None
        _cosmos_container = None


def build_document(
    *,
    host: str,
    user_agent: str,
    pattern: Optional[str],
    text: Optional[str],
    replace: Optional[str],
    options: int,
    duration_ms: int,
    match_count: int,
    error: Optional[str],
) -> dict[str, Any]:
    """Build the standardized 12-field telemetry document. Pure function, no I/O — kept
    separate from `send_telemetry` so the shape can be unit-tested without a live Cosmos
    account."""
    return {
        "id": str(uuid.uuid4()),
        "engineKey": ENGINE_KEY,
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f") + "Z",
        "host": host or "",
        "userAgent": user_agent or "",
        "pattern": pattern,
        "text": text,
        "replace": replace,
        "options": options,
        "durationMs": duration_ms,
        "matchCount": match_count,
        "error": error,
    }


def send_telemetry(document: dict[str, Any]) -> None:
    """Write a pre-built document to Cosmos. Intended to run as a FastAPI `BackgroundTasks`
    callable, i.e. after the response has already been sent. Every exception is swallowed and
    logged at warning level at most — telemetry must never affect the client-facing response."""
    if _cosmos_container is None:
        return

    try:
        _cosmos_container.create_item(body=document)
    except Exception:  # noqa: BLE001 - telemetry must never raise
        logger.warning("Telemetry write to Cosmos DB failed.", exc_info=True)
