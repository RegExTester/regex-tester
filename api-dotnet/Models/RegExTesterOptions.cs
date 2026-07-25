using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;

namespace RegExTester.Api.DotNet.Models
{
    /// <summary>
    /// Bitwise flags that control regex matching behaviour.
    /// Values 0–1024 map directly to <see cref="System.Text.RegularExpressions.RegexOptions"/>.
    /// <c>ShowCaptures</c> (32768) is a custom flag handled by the API before forwarding to .NET.
    /// </summary>
    [Flags]
    public enum RegExTesterOptions
    {
        /// <summary>No options. Default behaviour.</summary>
        None = RegexOptions.None,                                           // 0b0000_0000_0000_0000 = 0
        /// <summary>Case-insensitive matching.</summary>
        IgnoreCase = RegexOptions.IgnoreCase,                               // 0b0000_0000_0000_0001 = 1
        /// <summary><c>^</c> and <c>$</c> match the start/end of each line.</summary>
        Multiline = RegexOptions.Multiline,                                 // 0b0000_0000_0000_0010 = 2
        /// <summary>Only explicitly named or numbered groups are captured.</summary>
        ExplicitCapture = RegexOptions.ExplicitCapture,                     // 0b0000_0000_0000_0100 = 4
        /// <summary>Compile the expression to an assembly for faster repeated use.</summary>
        Compiled = RegexOptions.Compiled,                                   // 0b0000_0000_0000_1000 = 8
        /// <summary><c>.</c> matches every character including <c>\n</c>.</summary>
        Singleline = RegexOptions.Singleline,                               // 0b0000_0000_0001_0000 = 16
        /// <summary>Unescaped whitespace in the pattern is ignored; <c>#</c> starts a comment.</summary>
        IgnorePatternWhitespace = RegexOptions.IgnorePatternWhitespace,     // 0b0000_0000_0010_0000 = 32
        /// <summary>Search proceeds right-to-left instead of left-to-right.</summary>
        RightToLeft = RegexOptions.RightToLeft,                             // 0b0000_0000_0100_0000 = 64
        /// <summary>ECMAScript-compliant behaviour (must be combined with IgnoreCase and/or Multiline only).</summary>
        ECMAScript = RegexOptions.ECMAScript,                               // 0b0000_0001_0000_0000 = 256
        /// <summary>Cultural invariant matching regardless of the current locale.</summary>
        CultureInvariant = RegexOptions.CultureInvariant,                   // 0b0000_0010_0000_0000 = 512
        /// <summary>Use a non-backtracking (linear-time) matching engine.</summary>
        NonBacktracking = RegexOptions.NonBacktracking,                     // 0b0000_0100_0000_0000 = 1024
        /// <summary>
        /// Custom flag: include capture collections in each match and group in the response.
        /// Not forwarded to <see cref="System.Text.RegularExpressions.RegexOptions"/>.
        /// </summary>
        ShowCaptures = 1 << 15                                              // 0b1000_0000_0000_0000 = 32768
    }

    /// <summary>
    /// The single source of truth for the shared contract's option flag registry (see
    /// <c>docs/design/api-contract.md</c> §3), used by <c>GET /api/capabilities</c>. Lists every flag
    /// defined by the contract — including bits this engine does not implement — so the frontend can
    /// render unsupported flags as disabled rather than omit them. The reserved value 128 (.NET's
    /// internal Debug bit (<c>RegexOptions.Debug</c> = 128) is intentionally not listed.
    /// </summary>
    public static class RegExTesterOptionsRegistry
    {
        /// <summary>
        /// The single source of truth for this engine's identifier, as reported by
        /// <c>GET /api/capabilities</c> (<c>engineKey</c>) and reused unchanged by
        /// <see cref="Services.TelemetryService"/> so the two can never drift apart.
        /// </summary>
        public const string EngineKey = "DOTNET";

        public static readonly IReadOnlyList<CapabilityOption> All = new List<CapabilityOption>
        {
            new CapabilityOption { Value = 1, Name = "IgnoreCase", Flag = null, Supported = true, Description = "Case-insensitive matching." },
            new CapabilityOption { Value = 2, Name = "Multiline", Flag = null, Supported = true, Description = "^ and $ match the start/end of each line." },
            new CapabilityOption { Value = 4, Name = "ExplicitCapture", Flag = null, Supported = true, Description = "Only explicitly named or numbered groups are captured." },
            new CapabilityOption { Value = 8, Name = "Compiled", Flag = null, Supported = true, Description = "Compile the expression to an assembly for faster repeated use." },
            new CapabilityOption { Value = 16, Name = "Singleline", Flag = null, Supported = true, Description = "'.' matches every character including '\\n'." },
            new CapabilityOption { Value = 32, Name = "IgnorePatternWhitespace", Flag = null, Supported = true, Description = "Unescaped whitespace in the pattern is ignored; '#' starts a comment." },
            new CapabilityOption { Value = 64, Name = "RightToLeft", Flag = null, Supported = true, Description = "Search proceeds right-to-left instead of left-to-right." },
            new CapabilityOption { Value = 256, Name = "ECMAScript", Flag = null, Supported = true, Description = "ECMAScript-compliant behaviour (must be combined with IgnoreCase and/or Multiline only)." },
            new CapabilityOption { Value = 512, Name = "CultureInvariant", Flag = null, Supported = true, Description = "Cultural invariant matching regardless of the current locale." },
            new CapabilityOption { Value = 1024, Name = "NonBacktracking", Flag = null, Supported = true, Description = "Use a non-backtracking (linear-time) matching engine." },
            new CapabilityOption { Value = 2048, Name = "HasIndices", Flag = null, Supported = false, Description = "Include start/end indices for each match (JS 'd' flag). Not supported by this engine; the bit is ignored." },
            new CapabilityOption { Value = 4096, Name = "Global", Flag = null, Supported = false, Description = "Find all matches rather than stopping after the first (JS 'g' flag). Not supported by this engine; the bit is ignored." },
            new CapabilityOption { Value = 8192, Name = "Unicode", Flag = null, Supported = false, Description = "Enable full Unicode matching (JS 'u' flag). Not supported by this engine; the bit is ignored." },
            new CapabilityOption { Value = 16384, Name = "UnicodeSets", Flag = null, Supported = false, Description = "Enable Unicode set notation (JS 'v' flag). Not supported by this engine; the bit is ignored." },
            new CapabilityOption { Value = 32768, Name = "ShowCaptures", Flag = null, Supported = true, Description = "Custom flag: include capture collections in each match and group in the response. Stripped before the remaining bits reach the underlying regex engine." },
            new CapabilityOption { Value = 65536, Name = "Sticky", Flag = null, Supported = false, Description = "Match only from the last match position (JS 'y' flag). Not supported by this engine; the bit is ignored." },
            new CapabilityOption { Value = 131072, Name = "Ascii", Flag = null, Supported = false, Description = "Restrict matching to ASCII characters (Python 're.ASCII'). Not supported by this engine; the bit is ignored." },
        };
    }
}
