"""GET /, GET /api/version, GET /api/capabilities."""

from __future__ import annotations

import platform
import time

from fastapi import APIRouter, Response
from fastapi.responses import RedirectResponse

from ..models import Capabilities, VersionResult
from ..services.capabilities import get_capabilities

router = APIRouter()

_CACHE_TTL_SECONDS = 24 * 60 * 60
_cached_version: VersionResult | None = None
_cached_at: float = 0.0


@router.get("/", tags=["Home"], summary="Redirect to the frontend")
def get_root() -> RedirectResponse:
    return RedirectResponse(url="https://regextester.github.io/", status_code=302)


@router.get("/api/version", response_model=VersionResult, tags=["Version"],
            summary="Report engine and runtime version information")
def get_version() -> VersionResult:
    global _cached_version, _cached_at
    now = time.monotonic()
    if _cached_version is None or now - _cached_at > _CACHE_TTL_SECONDS:
        _cached_version = VersionResult(
            engineKey="PYTHON",
            engineName="Python",
            contractVersion="1.0",
            os=f"{platform.system()} {platform.release()} {platform.machine()}",
            framework=f"Python {platform.python_version()}",
        )
        _cached_at = now
    return _cached_version


@router.get("/api/capabilities", response_model=Capabilities, tags=["Capabilities"],
            summary="Report the options, limits, and features this engine supports")
def get_capabilities_route(response: Response) -> Capabilities:
    response.headers["Cache-Control"] = "public, max-age=86400"
    return Capabilities(**get_capabilities())
