"""Core regex matching logic backing POST /api/regex.

Uses the Python stdlib `re` module only (no third-party `regex` package). Regex compile
errors and the 15-second evaluation timeout are reported via the `error` field with HTTP
200 — never as an exception that would surface as an HTTP error status.
"""

from __future__ import annotations

import re
import time

from ..models import CaptureResult, GroupResult, MatchResult, RegexResult
from ..options import FLAG_SHOW_CAPTURES, to_re_flags

REGEX_TIMEOUT_SECONDS = 15

# .NET and JavaScript both spell a named capture group `(?<name>...)`; Python's `re` requires
# `(?P<name>...)`. Translate the former to the latter so a pattern using named groups is
# portable across engines. Lookbehind assertions `(?<=...)` / `(?<!...)` start with the same
# three characters but are not named groups, so they are deliberately excluded.
_DOTNET_NAMED_GROUP_RE = re.compile(r"\(\?<(?![=!])(?P<gname>[A-Za-z_]\w*)>")


def _translate_pattern(pattern: str) -> str:
    return _DOTNET_NAMED_GROUP_RE.sub(lambda m: f"(?P<{m.group('gname')}>", pattern)


# Converts `$1`, `${name}` and the literal `$$` escape into Python `re.sub` backreference
# syntax (`\1`, `\g<name>`, `$`) so replacement strings behave the same across engines.
_DOLLAR_TOKEN_RE = re.compile(r"\$\$|\$\{(?P<name>[A-Za-z_][A-Za-z0-9_]*)\}|\$(?P<num>\d+)")


def _convert_replacement(replace: str) -> str:
    # Double up any literal backslash first so it survives re.sub's own backslash
    # processing, then rewrite the $-style tokens into \1 / \g<name> form.
    escaped = replace.replace("\\", "\\\\")

    def _sub(m: re.Match) -> str:
        if m.group(0) == "$$":
            return "$"
        name = m.group("name")
        if name:
            return f"\\g<{name}>"
        return f"\\{m.group('num')}"

    return _DOLLAR_TOKEN_RE.sub(_sub, escaped)


def _build_capture(index: int, length: int, value: str) -> CaptureResult:
    return CaptureResult(index=index, length=length, value=value)


def _build_match_result(m: re.Match, compiled: re.Pattern, show_captures: bool) -> MatchResult:
    # Reverse map of group index -> name, so named groups report their name and
    # unnamed groups fall back to their 1-based number.
    index_to_name = {index: name for name, index in compiled.groupindex.items()}

    groups: list[GroupResult] = []
    for i in range(1, compiled.groups + 1):
        value = m.group(i)
        if value is None:
            # Group did not participate in this match.
            continue
        start, end = m.span(i)
        name = index_to_name.get(i, str(i))
        groups.append(
            GroupResult(
                name=name,
                index=start,
                length=end - start,
                value=value,
                captures=[_build_capture(start, end - start, value)] if show_captures else None,
            )
        )

    whole_start, whole_end = m.span(0)
    whole_value = m.group(0)
    return MatchResult(
        name="0",
        index=whole_start,
        length=whole_end - whole_start,
        value=whole_value,
        groups=groups,
        captures=[_build_capture(whole_start, whole_end - whole_start, whole_value)] if show_captures else None,
    )


def match(pattern: str | None, text: str | None, replace: str | None, options: int) -> RegexResult:
    """Run `pattern` against `text` and build the RegexResult response body."""
    if not pattern:
        return RegexResult(error=None, replace=None, matches=[])

    show_captures = bool(options & FLAG_SHOW_CAPTURES)
    re_flags = to_re_flags(options)
    input_text = text or ""

    try:
        compiled = re.compile(_translate_pattern(pattern), re_flags)
    except re.error as exc:
        return RegexResult(error=str(exc), replace=None, matches=[])

    matches: list[MatchResult] = []
    deadline = time.monotonic() + REGEX_TIMEOUT_SECONDS
    last_end = -1

    try:
        for m in compiled.finditer(input_text):
            if time.monotonic() > deadline:
                return RegexResult(
                    error="The regex match timed out (exceeded 15 seconds).",
                    replace=None,
                    matches=[],
                )
            # Defensive guard against a zero-length match at the same position
            # ever repeating (finditer already advances past empty matches, but
            # this ensures we never spin forever if that invariant ever changes).
            if m.start() == m.end() and m.end() == last_end:
                break
            last_end = m.end()
            matches.append(_build_match_result(m, compiled, show_captures))
    except re.error as exc:
        return RegexResult(error=str(exc), replace=None, matches=[])

    replace_result: str | None = None
    if replace is not None:
        try:
            converted = _convert_replacement(replace)
            replace_result = compiled.sub(converted, input_text)
        except re.error as exc:
            return RegexResult(error=str(exc), replace=None, matches=matches)

    return RegexResult(error=None, replace=replace_result, matches=matches)
