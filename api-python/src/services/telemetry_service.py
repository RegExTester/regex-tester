"""Cosmos DB telemetry for api-python.

Mirrors the .NET (`TelemetryService`) and Node.js (`telemetryService`) implementations: Entra ID
authentication via `DefaultAzureCredential` with no account key anywhere, bounded synchronous
client init at startup, silently disabled when `COSMOS_ENDPOINT` is empty, `/timestamp` partition
key, and fire-and-forget so a Cosmos outage can never affect the `POST /api/regex` response.
Because FastAPI's route handler is synchronous, the write itself is dispatched as a
`BackgroundTasks` callable (see `routers/regex.py`) rather than awaited on the request path.
"""

from __future__ import annotations

import logging
import threading
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from azure.cosmos import CosmosClient
from azure.identity import DefaultAzureCredential

from .capabilities import ENGINE_KEY

logger = logging.getLogger(__name__)

_cosmos_client: Optional[CosmosClient] = None
_cosmos_container = None

# Upper bound, in seconds, on Cosmos initialization. `init_cosmos` runs on the startup path, so an
# unreachable endpoint would otherwise hang startup and turn a telemetry outage into a total outage.
INIT_TIMEOUT_SECONDS = 10


def _connect(endpoint: str, database: str, container: str) -> None:
    """Establish the client, database and container. Never raises — a bad, unreachable or slow
    endpoint, a missing role assignment or an unavailable credential must not prevent the app
    from starting."""
    global _cosmos_client, _cosmos_container

    try:
        # Entra ID, never an account key: DefaultAzureCredential resolves the App Service managed
        # identity in Azure and the developer's az login session locally. A rotated key silently
        # disabled telemetry for five weeks in 2026-07; there is now no key.
        client = CosmosClient(
            endpoint,
            credential=DefaultAzureCredential(),
            connection_timeout=INIT_TIMEOUT_SECONDS,
            read_timeout=INIT_TIMEOUT_SECONDS,
        )
        cont = client.get_database_client(database).get_container_client(container)

        # get_*_client only build client-side handles, so without this read the first token
        # acquisition - and any 403 from a missing role assignment - would be deferred to the
        # first write and lost in its except. One metadata round trip here proves the identity can
        # reach the container, and is covered by the readMetadata action of Cosmos DB Built-in
        # Data Contributor. It replaces the two create_*_if_not_exists calls, which that role
        # deliberately cannot perform: creating a database or container is a control-plane
        # operation. The container is provisioned by DEPLOYMENT.md section 2 and must already
        # exist, partitioned on /timestamp.
        cont.read(timeout=INIT_TIMEOUT_SECONDS)

        # Published only once the round trip succeeded, so a partially initialized client is
        # never visible to send_telemetry.
        _cosmos_container = cont
        _cosmos_client = client
    except Exception:  # noqa: BLE001 - telemetry init must never crash startup
        logger.warning("Cosmos DB telemetry initialization failed; telemetry is disabled.", exc_info=True)


def init_cosmos(endpoint: str, database: str, container: str) -> None:
    """Initialize the Cosmos client/database/container. No-op when `endpoint` is empty.

    Runs on the startup path, before the app serves any request, so the very first request is
    recorded rather than silently dropped. Returns after at most `INIT_TIMEOUT_SECONDS` even if
    Cosmos has not answered: the SDK's own timeout arguments overshoot the budget against a
    blackholed endpoint (measured ~12 s for a 10 s budget), so the bound is enforced out here. A
    connection that completes after the bound still publishes its client — it is perfectly usable,
    it just missed the startup window.
    """
    if not endpoint or _cosmos_client is not None:
        return

    worker = threading.Thread(
        target=_connect,
        args=(endpoint, database, container),
        name="telemetry-init",
        daemon=True,
    )
    worker.start()
    worker.join(INIT_TIMEOUT_SECONDS)

    if worker.is_alive():
        logger.warning(
            "Cosmos DB telemetry initialization exceeded %s s; starting without it.",
            INIT_TIMEOUT_SECONDS,
        )


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
