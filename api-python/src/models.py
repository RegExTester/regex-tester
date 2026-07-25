"""Pydantic models mirroring the canonical v1 contract schemas.

See docs/open-api/regex-tester-api.v1.yaml and docs/design/api-contract.md for the
authoritative definitions. Response models never exclude `None` fields — every field
declared here is always emitted in the JSON body.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class Input(BaseModel):
    """Request body for POST /api/regex. No property is required."""

    pattern: Optional[str] = Field(default=None, max_length=512)
    text: Optional[str] = Field(default=None, max_length=1024)
    replace: Optional[str] = Field(default=None, max_length=1024)
    options: int = 0


class CaptureResult(BaseModel):
    index: int
    length: int
    value: str


class GroupResult(BaseModel):
    name: str
    index: int
    length: int
    value: str
    captures: Optional[list[CaptureResult]] = None


class MatchResult(BaseModel):
    name: str
    index: int
    length: int
    value: str
    groups: list[GroupResult] = Field(default_factory=list)
    captures: Optional[list[CaptureResult]] = None


class RegexResult(BaseModel):
    error: Optional[str] = None
    replace: Optional[str] = None
    matches: list[MatchResult] = Field(default_factory=list)


class Runtime(BaseModel):
    """Diagnostic host/runtime information. Informational only; MUST NOT be used by clients to
    drive frontend behaviour or feature detection."""

    os: str
    framework: str


class Limits(BaseModel):
    patternMaxLength: int
    textMaxLength: int
    replaceMaxLength: int
    regexTimeoutMs: int
    requestTimeoutMs: int
    maxRequestBodyBytes: int


class Features(BaseModel):
    replace: bool
    namedGroups: bool
    captures: str


class CapabilityOption(BaseModel):
    value: int
    name: str
    flag: Optional[str] = None
    supported: bool
    description: str


class Capabilities(BaseModel):
    engineKey: str
    engineName: str
    contractVersion: str
    runtime: Runtime
    defaultOptions: int
    limits: Limits
    features: Features
    options: list[CapabilityOption]


class ProblemDetails(BaseModel):
    type: str
    title: str
    status: int
    errors: dict[str, list[str]]
