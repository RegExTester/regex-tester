using System.ComponentModel.DataAnnotations;

namespace RegExTester.Api.DotNet.Models
{
    /// <summary>Request body for the regex matching endpoint.</summary>
    public class Input
    {
        /// <summary>
        /// Bitwise combination of <see cref="RegExTesterOptions"/> flags.
        /// Use <c>0</c> for no options.
        /// The custom <c>ShowCaptures</c> flag (32768) causes capture collections to be
        /// included in each match and group; it is stripped before being passed to the
        /// .NET <c>RegexOptions</c> enum.
        /// </summary>
        public RegExTesterOptions Options { get; set; }

        /// <summary>The regular expression pattern to evaluate. Maximum 512 characters.</summary>
        [StringLength(512)]
        public string Pattern { get; set; }

        /// <summary>The input text to search. Maximum 1024 characters.</summary>
        [StringLength(1024)]
        public string Text { get; set; }

        /// <summary>
        /// Optional replacement string. When supplied, the response will include a <c>replace</c>
        /// field containing the result of calling <c>Regex.Replace(text, replace)</c>.
        /// Maximum 1024 characters.
        /// </summary>
        [StringLength(1024)]
        public string Replace { get; set; }
    }
}
