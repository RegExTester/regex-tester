using System.Collections.Generic;

namespace RegExTester.Api.DotNet.Models
{
    /// <summary>Top-level result returned by the regex matching endpoint.</summary>
    public class RegexResult
    {
        /// <summary>Error message when the pattern is invalid or the match times out; <c>null</c> on success.</summary>
        public string Error { get; set; }

        /// <summary>
        /// String produced by applying the <c>replace</c> pattern to the input text.
        /// <c>null</c> when no replace pattern was supplied.
        /// </summary>
        public string Replace { get; set; }

        /// <summary>All matches found in the input text. Empty array when there are no matches.</summary>
        public List<MatchResult> Matches { get; set; }
    }

    /// <summary>A single regex match within the input text.</summary>
    public class MatchResult
    {
        /// <summary>Match name (always <c>"0"</c> for the whole-match group).</summary>
        public string Name { get; set; }

        /// <summary>Zero-based character offset where the match starts.</summary>
        public int Index { get; set; }

        /// <summary>Length of the matched substring in characters.</summary>
        public int Length { get; set; }

        /// <summary>The matched substring.</summary>
        public string Value { get; set; }

        /// <summary>Named and numbered capturing groups within this match.</summary>
        public List<GroupResult> Groups { get; set; }

        /// <summary>
        /// All captures of the whole match.
        /// Only populated when the <c>ShowCaptures</c> flag (32768) is set in <c>options</c>.
        /// </summary>
        public List<CaptureResult> Captures { get; set; }
    }

    /// <summary>A single capturing group within a match.</summary>
    public class GroupResult
    {
        /// <summary>Group name or number (e.g. <c>"1"</c>, <c>"word"</c>).</summary>
        public string Name { get; set; }

        /// <summary>Zero-based character offset where the group match starts.</summary>
        public int Index { get; set; }

        /// <summary>Length of the group match in characters.</summary>
        public int Length { get; set; }

        /// <summary>The substring matched by this group.</summary>
        public string Value { get; set; }

        /// <summary>
        /// All individual captures of this group.
        /// Only populated when the <c>ShowCaptures</c> flag (32768) is set in <c>options</c>.
        /// </summary>
        public List<CaptureResult> Captures { get; set; }
    }

    /// <summary>An individual capture produced by a group that matches multiple times.</summary>
    public class CaptureResult
    {
        /// <summary>Zero-based character offset where this capture starts.</summary>
        public int Index { get; set; }

        /// <summary>Length of this capture in characters.</summary>
        public int Length { get; set; }

        /// <summary>The captured substring.</summary>
        public string Value { get; set; }
    }
}
