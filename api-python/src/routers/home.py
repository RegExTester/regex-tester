"""GET /, GET /api/capabilities."""

from __future__ import annotations

from fastapi import APIRouter, Response
from fastapi.responses import RedirectResponse

from ..models import Capabilities
from ..services.capabilities import get_capabilities

router = APIRouter()


@router.get("/", tags=["Home"], summary="Redirect to the frontend")
def get_root() -> RedirectResponse:
    return RedirectResponse(url="https://regextester.github.io/", status_code=302)


@router.get("/api/capabilities", response_model=Capabilities, tags=["Capabilities"],
            summary="Report engine identity and the options, limits, and features this engine supports")
def get_capabilities_route(response: Response) -> Capabilities:
    response.headers["Cache-Control"] = "public, max-age=86400"
    return Capabilities(**get_capabilities())
