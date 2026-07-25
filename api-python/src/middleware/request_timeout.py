"""5-second HTTP request timeout, applied only to POST /api/regex.

On expiry, returns HTTP 200 (never 408) with an `error` populated body, matching the
behavioural contract in docs/design/api-contract.md §4.
"""

from __future__ import annotations

import asyncio

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

REQUEST_TIMEOUT_SECONDS = 5


class RequestTimeoutMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.url.path != "/api/regex":
            return await call_next(request)

        try:
            return await asyncio.wait_for(call_next(request), timeout=REQUEST_TIMEOUT_SECONDS)
        except asyncio.TimeoutError:
            return JSONResponse(
                status_code=200,
                content={
                    "error": f"The request timed out (exceeded {REQUEST_TIMEOUT_SECONDS} seconds).",
                    "replace": None,
                    "matches": [],
                },
            )
