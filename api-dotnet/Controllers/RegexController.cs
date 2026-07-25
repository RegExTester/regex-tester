using Microsoft.AspNetCore.Mvc;
using RegExTester.Api.DotNet.Models;
using RegExTester.Api.DotNet.Services;
using System;
using System.Diagnostics;
using System.Threading;

namespace RegExTester.Api.DotNet.Controllers
{
    /// <summary>Executes .NET regular expressions against supplied input text.</summary>
    [ApiController]
    [Route("api/regex")]
    [Produces("application/json")]
    public class RegExController : Controller
    {
        public IRegExProcessor RegExProcessor { get; set; }
        public ITelemetryService TelemetryService { get; set; }

        public RegExController(IRegExProcessor regExProcessor, ITelemetryService telemetryService)
        {
            this.RegExProcessor = regExProcessor;
            this.TelemetryService = telemetryService;
        }

        /// <summary>Run a regular expression and return all matches.</summary>
        /// <remarks>
        /// Applies the provided regex pattern to the input text using the specified option flags.
        /// All string fields are Base64Url-encoded by the frontend before submission but
        /// the API itself accepts plain UTF-8 JSON strings.
        ///
        /// **Timeout:** The regex engine enforces a 15-second match timeout; the HTTP request
        /// has a 5-second middleware timeout. If either is exceeded an error message is returned
        /// in the `error` field rather than throwing an HTTP error.
        /// </remarks>
        /// <param name="model">Pattern, text, optional replacement string, and regex option flags.</param>
        /// <param name="cancellationToken">Request cancellation token.</param>
        /// <returns>Match results including groups and (optionally) captures.</returns>
        /// <response code="200">Regex executed successfully; inspect <c>error</c> field for pattern errors.</response>
        /// <response code="400">Request body failed model validation (e.g. pattern &gt; 512 chars).</response>
        [HttpPost]
        [ProducesResponseType(typeof(RegexResult), 200)]
        [ProducesResponseType(400)]
        public ActionResult Post([FromBody] Input model, CancellationToken cancellationToken)
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }

            var stopwatch = Stopwatch.StartNew();
            var result = RegExProcessor.Matches(model.Pattern, model.Text, model.Replace, model.Options);
            stopwatch.Stop();

            // Fire-and-forget: TelemetryService dispatches the Cosmos write on a background task
            // and never throws, so this call never delays or affects the response below.
            TelemetryService.RecordTelemetry(Request, model, stopwatch.Elapsed, result.Matches.Count, result.Error);

            return Json(result);
        }
    }
}
