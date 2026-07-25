using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using RegExTester.Api.DotNet.Models;

namespace RegExTester.Api.DotNet.Services
{
    public interface IRegExProcessor
    {
        RegexResult Matches(string pattern, string text, string replace, RegExTesterOptions options);
    }

    public class RegExProcessor : IRegExProcessor
    {
        static readonly TimeSpan RegexMatchTimeout = TimeSpan.FromSeconds(15);

        /// <summary>
        /// Bits of <see cref="RegExTesterOptions"/> that map directly onto
        /// <see cref="System.Text.RegularExpressions.RegexOptions"/>. Any other bit (the custom
        /// <c>ShowCaptures</c> flag, or bits only meaningful to other engines) is masked out before
        /// constructing a <see cref="Regex"/>, so unsupported bits are silently ignored rather than
        /// throwing <see cref="ArgumentOutOfRangeException"/>.
        /// </summary>
        const RegExTesterOptions SupportedRegexOptionsMask =
            RegExTesterOptions.IgnoreCase |
            RegExTesterOptions.Multiline |
            RegExTesterOptions.ExplicitCapture |
            RegExTesterOptions.Compiled |
            RegExTesterOptions.Singleline |
            RegExTesterOptions.IgnorePatternWhitespace |
            RegExTesterOptions.RightToLeft |
            RegExTesterOptions.ECMAScript |
            RegExTesterOptions.CultureInvariant |
            RegExTesterOptions.NonBacktracking;

        public RegexResult Matches(string pattern, string text, string replace, RegExTesterOptions options)
        {
            var result = new RegexResult
            {
                Error = null,
                Replace = null,
                Matches = new List<MatchResult>()
            };

            if (string.IsNullOrEmpty(pattern))
            {
                return result;
            }

            try
            {
                var showCaptures = options.HasFlag(RegExTesterOptions.ShowCaptures);
                var regexOptions = (RegexOptions)(options & SupportedRegexOptionsMask);
                var regex = new Regex(pattern, regexOptions, RegexMatchTimeout);
                var matches = regex.Matches(text);

                foreach (Match match in matches)
                {
                    var matchItem = new MatchResult
                    {
                        Name = match.Name,
                        Index = match.Index,
                        Length = match.Length,
                        Value = match.Value,
                        Groups = new List<GroupResult>(),
                        Captures = showCaptures ? GetCaptures(match.Captures) : null
                    };

                    foreach (Group group in match.Groups)
                    {
                        matchItem.Groups.Add(new GroupResult
                        {
                            Name = group.Name,
                            Index = group.Index,
                            Length = group.Length,
                            Value = group.Value,
                            Captures = showCaptures ? GetCaptures(group.Captures) : null
                        });
                    }

                    result.Matches.Add(matchItem);
                }

                if (replace != null)
                {
                    result.Replace = regex.Replace(text, replace);
                }
            }
            catch (Exception ex)
            {
                result.Error = ex.Message;
                result.Matches = new List<MatchResult>();
            }

            return result;
        }

        private List<CaptureResult> GetCaptures(CaptureCollection captures)
        {
            var result = new List<CaptureResult>();
            foreach (Capture capture in captures)
            {
                result.Add(new CaptureResult
                {
                    Index = capture.Index,
                    Length = capture.Length,
                    Value = capture.Value
                });
            }
            return result;
        }
    }
}

