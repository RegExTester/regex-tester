"""POST /api/regex."""

from __future__ import annotations

from fastapi import APIRouter

from ..models import Input, RegexResult
from ..services import regex_processor
from ..services.telemetry_service import send_telemetry

router = APIRouter()


@router.post("/api/regex", response_model=RegexResult, tags=["RegEx"],
             summary="Run a regular expression against input text")
def post_regex(body: Input) -> RegexResult:
    result = regex_processor.match(body.pattern, body.text, body.replace, body.options)
    send_telemetry(body)
    return result
