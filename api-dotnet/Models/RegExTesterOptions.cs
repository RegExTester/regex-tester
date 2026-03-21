using System;
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
}
