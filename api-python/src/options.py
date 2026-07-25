"""Option flag registry and bitmask -> Python `re` flag mapping.

The bitmask is shared across every backend (see docs/design/api-contract.md §3). Only a
subset of bits have a native Python `re` equivalent; every other bit MUST be accepted and
silently ignored rather than rejected, so a single bitmask stays portable across engines.
"""

from __future__ import annotations

import re

FLAG_IGNORE_CASE = 1
FLAG_MULTILINE = 2
FLAG_EXPLICIT_CAPTURE = 4
FLAG_COMPILED = 8
FLAG_SINGLELINE = 16
FLAG_IGNORE_PATTERN_WHITESPACE = 32
FLAG_RIGHT_TO_LEFT = 64
# 128 is permanently reserved (historically .NET's internal Debug bit) and must never be used.
FLAG_ECMASCRIPT = 256
FLAG_CULTURE_INVARIANT = 512
FLAG_NON_BACKTRACKING = 1024
FLAG_HAS_INDICES = 2048
FLAG_GLOBAL = 4096
FLAG_UNICODE = 8192
FLAG_UNICODE_SETS = 16384
FLAG_SHOW_CAPTURES = 32768
FLAG_STICKY = 65536
FLAG_ASCII = 131072

# Bits this engine natively supports, mapped to their `re` flag.
SUPPORTED_RE_FLAGS: dict[int, re.RegexFlag] = {
    FLAG_IGNORE_CASE: re.IGNORECASE,
    FLAG_MULTILINE: re.MULTILINE,
    FLAG_SINGLELINE: re.DOTALL,
    FLAG_IGNORE_PATTERN_WHITESPACE: re.VERBOSE,
    FLAG_ASCII: re.ASCII,
}

# Pre-selected bitmask the frontend should default to for this engine (IgnoreCase | Multiline).
DEFAULT_OPTIONS = FLAG_IGNORE_CASE | FLAG_MULTILINE


def to_re_flags(options: int) -> re.RegexFlag:
    """Translate the bitmask to Python `re` flags, ignoring every unsupported/unknown bit."""
    flags = re.RegexFlag(0)
    for bit, re_flag in SUPPORTED_RE_FLAGS.items():
        if options & bit:
            flags |= re_flag
    return flags


# Every flag known to the contract, for GET /api/capabilities. Unsupported flags are still
# listed (with supported=false and flag=null) so the frontend can render them as disabled.
OPTION_REGISTRY: list[dict] = [
    {
        "value": FLAG_IGNORE_CASE, "name": "IgnoreCase", "flag": "IGNORECASE", "supported": True,
        "description": "Case-insensitive matching.",
    },
    {
        "value": FLAG_MULTILINE, "name": "Multiline", "flag": "MULTILINE", "supported": True,
        "description": "^ and $ match at the start/end of each line.",
    },
    {
        "value": FLAG_EXPLICIT_CAPTURE, "name": "ExplicitCapture", "flag": None, "supported": False,
        "description": "Only explicitly named or numbered groups are captured. Not supported by this engine; the bit is ignored.",
    },
    {
        "value": FLAG_COMPILED, "name": "Compiled", "flag": None, "supported": False,
        "description": "Compiles the regex to improve performance on repeated use. Not supported by this engine; the bit is ignored.",
    },
    {
        "value": FLAG_SINGLELINE, "name": "Singleline", "flag": "DOTALL", "supported": True,
        "description": "The . metacharacter also matches newline characters.",
    },
    {
        "value": FLAG_IGNORE_PATTERN_WHITESPACE, "name": "IgnorePatternWhitespace", "flag": "VERBOSE", "supported": True,
        "description": "Unescaped whitespace in the pattern is ignored and # starts a comment.",
    },
    {
        "value": FLAG_RIGHT_TO_LEFT, "name": "RightToLeft", "flag": None, "supported": False,
        "description": "Matching proceeds from right to left. Not supported by this engine; the bit is ignored.",
    },
    {
        "value": FLAG_ECMASCRIPT, "name": "ECMAScript", "flag": None, "supported": False,
        "description": "Enables ECMAScript-compliant matching behaviour. Not supported by this engine; the bit is ignored.",
    },
    {
        "value": FLAG_CULTURE_INVARIANT, "name": "CultureInvariant", "flag": None, "supported": False,
        "description": "Ignores culture-specific casing rules. Not supported by this engine; the bit is ignored.",
    },
    {
        "value": FLAG_NON_BACKTRACKING, "name": "NonBacktracking", "flag": None, "supported": False,
        "description": "Uses a non-backtracking matching engine. Not supported by this engine; the bit is ignored.",
    },
    {
        "value": FLAG_HAS_INDICES, "name": "HasIndices", "flag": None, "supported": False,
        "description": "Reports the start/end indices of each capture group. Not supported by this engine; the bit is ignored.",
    },
    {
        "value": FLAG_GLOBAL, "name": "Global", "flag": None, "supported": False,
        "description": "Finds all matches rather than stopping after the first. Not supported by this engine; the bit is ignored.",
    },
    {
        "value": FLAG_UNICODE, "name": "Unicode", "flag": None, "supported": False,
        "description": "Enables Unicode-aware matching semantics. Not supported by this engine; the bit is ignored.",
    },
    {
        "value": FLAG_UNICODE_SETS, "name": "UnicodeSets", "flag": None, "supported": False,
        "description": "Enables the extended Unicode set notation. Not supported by this engine; the bit is ignored.",
    },
    {
        "value": FLAG_SHOW_CAPTURES, "name": "ShowCaptures", "flag": None, "supported": True,
        "description": "Include individual capture arrays on the match and each group. Stripped before the pattern is compiled.",
    },
    {
        "value": FLAG_STICKY, "name": "Sticky", "flag": None, "supported": False,
        "description": "Matching only succeeds at the current position. Not supported by this engine; the bit is ignored.",
    },
    {
        "value": FLAG_ASCII, "name": "Ascii", "flag": "ASCII", "supported": True,
        "description": "Makes \\w, \\W, \\b, \\B, \\d, \\D, \\s and \\S match only ASCII characters.",
    },
]
