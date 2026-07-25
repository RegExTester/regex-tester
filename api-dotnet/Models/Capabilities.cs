using System.Collections.Generic;

namespace RegExTester.Api.DotNet.Models
{
    /// <summary>Response body for the capabilities endpoint.</summary>
    public class CapabilitiesResult
    {
        /// <summary>Short, stable, uppercase identifier for this engine.</summary>
        public string EngineKey { get; set; }

        /// <summary>Human-readable engine name.</summary>
        public string EngineName { get; set; }

        /// <summary>The version of the shared API contract this engine implements.</summary>
        public string ContractVersion { get; set; }

        /// <summary>The bitmask the frontend should pre-select for this engine when no shared URL state is present.</summary>
        public int DefaultOptions { get; set; }

        /// <summary>Request size and timeout limits enforced by this engine.</summary>
        public Limits Limits { get; set; }

        /// <summary>Optional capabilities this engine implements.</summary>
        public Features Features { get; set; }

        /// <summary>Every option flag known to the shared contract, annotated with whether this engine actually supports it.</summary>
        public List<CapabilityOption> Options { get; set; }
    }

    /// <summary>Request size and timeout limits enforced by this engine.</summary>
    public class Limits
    {
        /// <summary>Maximum length, in characters, accepted for <c>pattern</c>.</summary>
        public int PatternMaxLength { get; set; }

        /// <summary>Maximum length, in characters, accepted for <c>text</c>.</summary>
        public int TextMaxLength { get; set; }

        /// <summary>Maximum length, in characters, accepted for <c>replace</c>.</summary>
        public int ReplaceMaxLength { get; set; }

        /// <summary>Maximum time, in milliseconds, allowed for regex evaluation before it is aborted and reported as a timeout error.</summary>
        public int RegexTimeoutMs { get; set; }

        /// <summary>Maximum time, in milliseconds, allowed for the whole HTTP request before it is aborted and reported as a timeout error.</summary>
        public int RequestTimeoutMs { get; set; }

        /// <summary>Maximum accepted size, in bytes, of the whole HTTP request body.</summary>
        public int MaxRequestBodyBytes { get; set; }
    }

    /// <summary>Optional capabilities this engine implements.</summary>
    public class Features
    {
        /// <summary>Whether the <c>replace</c> request field is honoured.</summary>
        public bool Replace { get; set; }

        /// <summary>Whether named capture groups are supported and reported by name.</summary>
        public bool NamedGroups { get; set; }

        /// <summary>
        /// The level of per-group capture support when <c>ShowCaptures</c> is set:
        /// <c>none</c>, <c>single</c>, or <c>multi</c>.
        /// </summary>
        public string Captures { get; set; }
    }

    /// <summary>Describes one option flag and whether the running engine supports it.</summary>
    public class CapabilityOption
    {
        /// <summary>The bitmask value of this flag.</summary>
        public int Value { get; set; }

        /// <summary>The contract-wide name of this flag.</summary>
        public string Name { get; set; }

        /// <summary>The engine-native flag identifier (e.g. <c>"i"</c> for JS, <c>"IGNORECASE"</c> for Python); <c>null</c> for engines with no string-flag equivalent.</summary>
        public string Flag { get; set; }

        /// <summary>Whether this engine actually implements the flag, as opposed to silently ignoring it.</summary>
        public bool Supported { get; set; }

        /// <summary>Human-readable description of the flag's behaviour.</summary>
        public string Description { get; set; }
    }
}
