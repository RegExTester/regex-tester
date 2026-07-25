"""POST /api/regex."""

from __future__ import annotations

import time

from fastapi import APIRouter, BackgroundTasks, Request

from ..models import Input, RegexResult
from ..services import regex_processor
from ..services.telemetry_service import build_document, send_telemetry

router = APIRouter()


@router.post("/api/regex", response_model=RegexResult, tags=["RegEx"],
             summary="Run a regular expression against input text")
def post_regex(body: Input, request: Request, background_tasks: BackgroundTasks) -> RegexResult:
    start = time.perf_counter()
    result = regex_processor.match(body.pattern, body.text, body.replace, body.options)
    duration_ms = round((time.perf_counter() - start) * 1000)

    document = build_document(
        host=request.headers.get("host", "") or "",
        user_agent=request.headers.get("user-agent", "") or "",
        pattern=body.pattern,
        text=body.text,
        replace=body.replace,
        options=body.options,
        duration_ms=duration_ms,
        match_count=len(result.matches),
        error=result.error,
    )
    # Fire-and-forget: BackgroundTasks run after the response has been sent, and
    # send_telemetry() swallows every exception itself, so a Cosmos outage can never affect
    # this response.
    background_tasks.add_task(send_telemetry, document)

    return result
