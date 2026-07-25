using Microsoft.AspNetCore.Mvc;

namespace RegExTester.Api.DotNet.Controllers
{
    /// <summary>Utility endpoint for frontend navigation.</summary>
    [ApiController]
    [Route("/")]
    [Produces("application/json")]
    public class HomeController : Controller
    {
        /// <summary>Redirect to the frontend.</summary>
        /// <returns>HTTP 302 redirect to <c>https://regextester.github.io/</c>.</returns>
        [HttpGet]
        [ProducesResponseType(302)]
        public RedirectResult Get()
        {
            return Redirect("https://regextester.github.io/");
        }
    }
}

