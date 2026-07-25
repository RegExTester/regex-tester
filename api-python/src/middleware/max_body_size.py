"""Enforce a maximum request body size (denial-of-service mitigation).

Requests whose body exceeds ``MAX_REQUEST_BODY_BYTES`` are rejected with HTTP 413 before
the body is buffered in full:

- If ``Content-Length`` is present and already declares a size over the limit, the
  request is rejected immediately without reading the body at all.
- Otherwise (no ``Content-Length``, or an understated one — e.g. chunked
  transfer-encoding, or a client that lies about the length) the ASGI ``receive``
  callable is wrapped so every chunk is counted as it streams in. As soon as the
  running total crosses the limit, the request is rejected and reading stops —
  the remainder of the body is never buffered or handed to the application.

``MAX_REQUEST_BODY_BYTES`` is the single source of truth for this limit; import it
from here wherever the value is needed (e.g. the capabilities document).
"""

from __future__ import annotations

import json

from starlette.types import ASGIApp, Message, Receive, Scope, Send

MAX_REQUEST_BODY_BYTES = 8192

_PROBLEM_DETAILS_BODY = json.dumps(
    {
        "type": "https://tools.ietf.org/html/rfc9110#section-15.5.9",
        "title": f"The request body exceeds the maximum allowed size of {MAX_REQUEST_BODY_BYTES} bytes.",
        "status": 413,
    }
).encode("utf-8")


class MaxBodySizeMiddleware:
    """Pure ASGI middleware rejecting oversized request bodies with HTTP 413.

    Must be registered as the outermost middleware (i.e. added last, since
    ``Starlette.add_middleware`` prepends) so it wraps the transport-level
    ``receive`` callable directly, before any other middleware or the router gets
    a chance to read (and potentially buffer) the body.

    Note on why this doesn't just raise an exception from ``receive()``: FastAPI's
    routing layer wraps body parsing in a blanket ``except Exception`` that turns
    *any* error (including our own) into its own HTTP 400 response, so an exception
    raised here would never reach this middleware's `except` block — a response
    would already have been sent by the time it unwound. Instead, once the limit is
    exceeded this middleware sends the 413 response itself immediately, tells the
    inner app the client disconnected (so it stops reading), and then swallows any
    response the inner app subsequently (and harmlessly) tries to send.
    """

    def __init__(self, app: ASGIApp, max_bytes: int = MAX_REQUEST_BODY_BYTES) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = dict(scope.get("headers") or [])
        content_length = headers.get(b"content-length")
        if content_length is not None:
            try:
                declared_length = int(content_length)
            except ValueError:
                declared_length = None
            if declared_length is not None and declared_length > self.max_bytes:
                await self._reject(send)
                return

        received = 0
        rejected = False

        async def guarded_receive() -> Message:
            nonlocal received, rejected
            if rejected:
                # Already rejected: tell the caller the client is gone so it stops
                # trying to read more of the body instead of hanging.
                return {"type": "http.disconnect"}

            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body") or b"")
                if received > self.max_bytes:
                    rejected = True
                    await self._reject(send)
                    return {"type": "http.disconnect"}
            return message

        async def guarded_send(message: Message) -> None:
            if rejected:
                # We already sent the 413; drop whatever response the inner app
                # (which saw a disconnect) tries to send afterwards.
                return
            await send(message)

        await self.app(scope, guarded_receive, guarded_send)

    @staticmethod
    async def _reject(send: Send) -> None:
        await send(
            {
                "type": "http.response.start",
                "status": 413,
                "headers": [(b"content-type", b"application/problem+json")],
            }
        )
        await send({"type": "http.response.body", "body": _PROBLEM_DETAILS_BODY, "more_body": False})
