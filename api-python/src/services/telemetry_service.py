"""No-op telemetry stub.

Mirrors the interface of the .NET (`TelemetryService`) and Node.js (`telemetryService`)
implementations without any Cosmos SDK dependency or network calls. Real Cosmos DB telemetry
for api-python is out of scope for this task (see TASK-08).
"""

from __future__ import annotations

from ..models import Input


def send_telemetry(body: Input) -> None:
    """No-op — telemetry is not implemented for api-python yet."""
    return None
