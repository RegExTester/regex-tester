"""FastAPI app: CORS, routers, exception handlers, uvicorn entry point.

Run from the api-python/ directory with:
    python -m uvicorn src.main:app --reload --port 5200
"""

from __future__ import annotations

import os

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .middleware.max_body_size import MaxBodySizeMiddleware
from .middleware.request_timeout import RequestTimeoutMiddleware
from .routers import home, regex
from .services.telemetry_service import init_cosmos

# Defaults to "development" so a plain local `uvicorn` run allows the local frontend
# origin, matching api-nodejs and api-dotnet. Deployments must set ENVIRONMENT=production
# explicitly, which restricts CORS to the configured allow-list only.
ENVIRONMENT = os.environ.get("ENVIRONMENT", "development")
ALLOW_CORS = os.environ.get("ALLOW_CORS", "")

app = FastAPI(
    title="RegEx Tester API",
    description="REST API for testing Python regular expressions using the stdlib `re` module.",
    version="1.0",
    openapi_url="/openapi/v1.json",
    docs_url="/scalar/v1",
    redoc_url=None,
)

_extra_origins = [origin.strip() for origin in ALLOW_CORS.split(",") if origin.strip()]
_allow_origins = ["https://regextester.github.io", *_extra_origins]
_allow_origin_regex = r"^https?://localhost(:\d+)?$" if ENVIRONMENT != "production" else None

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allow_origins,
    allow_origin_regex=_allow_origin_regex,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)

app.add_middleware(RequestTimeoutMiddleware)

# Added last so Starlette treats it as the outermost middleware (add_middleware prepends
# to the stack), meaning it sees the raw transport-level `receive` before anything else
# can read or buffer the request body.
app.add_middleware(MaxBodySizeMiddleware)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Convert FastAPI's default 422 into an HTTP 400 RFC 9457 ProblemDetails body."""
    errors: dict[str, list[str]] = {}
    for error in exc.errors():
        loc = [str(part) for part in error["loc"] if part != "body"]
        field = loc[-1] if loc else "body"
        errors.setdefault(field, []).append(error["msg"])

    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={
            "type": "https://tools.ietf.org/html/rfc9110#section-15.5.1",
            "title": "One or more validation errors occurred.",
            "status": 400,
            "errors": errors,
        },
    )


app.include_router(home.router)
app.include_router(regex.router)

# Initialize telemetry (optional — silently disabled when COSMOS_CONNECTION_STRING is empty).
# Never raises: a bad or unreachable connection string must not prevent the app from starting.
init_cosmos(
    os.environ.get("COSMOS_CONNECTION_STRING", ""),
    os.environ.get("COSMOS_DATABASE", "regex-tester-db"),
    os.environ.get("COSMOS_CONTAINER", "telemetry"),
)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("src.main:app", host="0.0.0.0", port=int(os.environ.get("PORT", 5200)))
