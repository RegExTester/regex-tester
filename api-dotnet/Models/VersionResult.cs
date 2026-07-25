namespace RegExTester.Api.DotNet.Models
{
    /// <summary>Response body for the version endpoint.</summary>
    public class VersionResult
    {
        /// <summary>Short, stable, uppercase identifier for this engine.</summary>
        public string EngineKey { get; set; }

        /// <summary>Human-readable engine name.</summary>
        public string EngineName { get; set; }

        /// <summary>The version of the shared API contract this engine implements.</summary>
        public string ContractVersion { get; set; }

        /// <summary>Operating system description of the running host.</summary>
        public string Os { get; set; }

        /// <summary>Runtime/framework version description.</summary>
        public string Framework { get; set; }
    }
}
