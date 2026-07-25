"""Capability document for GET /api/capabilities."""

from __future__ import annotations

import platform

from ..middleware.max_body_size import MAX_REQUEST_BODY_BYTES
from ..options import DEFAULT_OPTIONS, OPTION_REGISTRY


def get_capabilities() -> dict:
    return {
        "engineKey": "PYTHON",
        "engineName": "Python",
        "contractVersion": "1.0",
        "runtime": {
            "os": f"{platform.system()} {platform.release()} {platform.machine()}",
            "framework": f"Python {platform.python_version()}",
        },
        "defaultOptions": DEFAULT_OPTIONS,
        "limits": {
            "patternMaxLength": 512,
            "textMaxLength": 1024,
            "replaceMaxLength": 1024,
            "regexTimeoutMs": 15000,
            "requestTimeoutMs": 5000,
            "maxRequestBodyBytes": MAX_REQUEST_BODY_BYTES,
        },
        "features": {"replace": True, "namedGroups": True, "captures": "single"},
        "options": OPTION_REGISTRY,
    }
