using Microsoft.AspNetCore.Mvc;
using System.Runtime.InteropServices;

namespace RegExTester.Api.DotNet.Controllers
{
    /// <summary>Utility endpoints for navigation and version information.</summary>
    [ApiController]
    [Route("/")]
    [Produces("application/json")]
    public class HomeController : Controller
    {
        /// <summary>Redirect to the Angular frontend.</summary>
        /// <returns>HTTP 302 redirect to <c>https://regextester.github.io/</c>.</returns>
        [HttpGet]
        [ProducesResponseType(302)]
        public RedirectResult Get()
        {
            return Redirect("https://regextester.github.io/");
        }

        /// <summary>Return runtime version information for the host.</summary>
        /// <remarks>Response is cached for 24 hours. Includes a <c>debug</c> flag when built in DEBUG configuration.</remarks>
        /// <returns>OS description and .NET framework version string.</returns>
        /// <response code="200">Version information.</response>
        [HttpGet]
        [Route("/api/version")]
        [ResponseCache(Duration = 60*60*24)] // 1d
        [ProducesResponseType(200)]
        public ActionResult Version()
        {
            return Json(new {
                #if DEBUG
                debug = 1,
                #endif
                os = RuntimeInformation.OSDescription,
                framework = RuntimeInformation.FrameworkDescription
            });
        }
    }
}
