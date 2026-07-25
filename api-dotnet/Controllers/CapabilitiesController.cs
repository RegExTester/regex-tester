using Microsoft.AspNetCore.Mvc;
using RegExTester.Api.DotNet.Models;
using System.Linq;
using System.Runtime.InteropServices;

namespace RegExTester.Api.DotNet.Controllers
{
    /// <summary>Reports engine identity, runtime, limits, features, and option flags this engine supports.</summary>
    [ApiController]
    [Route("/api/capabilities")]
    [Produces("application/json")]
    public class CapabilitiesController : Controller
    {
        // IgnoreCase | Multiline | ExplicitCapture | NonBacktracking = 1 | 2 | 4 | 1024
        const int DefaultOptionsMask =
            (int)RegExTesterOptions.IgnoreCase |
            (int)RegExTesterOptions.Multiline |
            (int)RegExTesterOptions.ExplicitCapture |
            (int)RegExTesterOptions.NonBacktracking;

        /// <summary>Return engine identity, runtime, limits, features, and the option flags this engine supports.</summary>
        /// <remarks>Response is cached for 24 hours.</remarks>
        /// <returns>Capability description for this backend.</returns>
        /// <response code="200">Capability description.</response>
        [HttpGet]
        [ResponseCache(Duration = 60*60*24)] // 1d
        [ProducesResponseType(typeof(CapabilitiesResult), 200)]
        public ActionResult Get()
        {
            return Json(new CapabilitiesResult
            {
                EngineKey = "DOTNET",
                EngineName = ".Net",
                ContractVersion = "1.0",
                Runtime = new Runtime
                {
                    Os = RuntimeInformation.OSDescription,
                    Framework = RuntimeInformation.FrameworkDescription
                },
                DefaultOptions = DefaultOptionsMask,
                Limits = new Limits
                {
                    PatternMaxLength = 512,
                    TextMaxLength = 1024,
                    ReplaceMaxLength = 1024,
                    RegexTimeoutMs = 15000,
                    RequestTimeoutMs = 5000,
                    MaxRequestBodyBytes = 8192
                },
                Features = new Features
                {
                    Replace = true,
                    NamedGroups = true,
                    Captures = "multi"
                },
                Options = RegExTesterOptionsRegistry.All.ToList()
            });
        }
    }
}
