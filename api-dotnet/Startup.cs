using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using RegExTester.Api.DotNet.Models;
using RegExTester.Api.DotNet.Services;
using Scalar.AspNetCore;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;

namespace RegExTester.Api.DotNet
{
    public class Startup
    {
        private static readonly TimeSpan RequestTimeout = TimeSpan.FromSeconds(5);

        // Matches the naming policy applied to controller-produced JSON (System.Text.Json default for
        // ASP.NET Core MVC is camelCase), used here so the timeout body written outside MVC stays consistent.
        private static readonly JsonSerializerOptions TimeoutResponseJsonOptions = new(JsonSerializerDefaults.Web);

        public Startup(IConfiguration configuration)
        {
            Configuration = configuration;
        }

        public IConfiguration Configuration { get; }

        // This method gets called by the runtime. Use this method to add services to the container.
        public void ConfigureServices(IServiceCollection services)
        {
            services.AddResponseCaching();
            services.AddControllers()
                .ConfigureApiBehaviorOptions(options =>
                {
                    // Emit RFC 9457 ProblemDetails for validation failures, with errors keyed by
                    // camelCase property name and every value an array of strings.
                    options.InvalidModelStateResponseFactory = context =>
                    {
                        var errors = context.ModelState
                            .Where(entry => entry.Value?.Errors.Count > 0)
                            .ToDictionary(
                                entry => JsonNamingPolicy.CamelCase.ConvertName(entry.Key),
                                entry => entry.Value.Errors.Select(e => e.ErrorMessage).ToArray()
                            );

                        var problemDetails = new ValidationProblemDetails(errors)
                        {
                            Type = "https://tools.ietf.org/html/rfc9110#section-15.5.1",
                            Title = "One or more validation errors occurred.",
                            Status = StatusCodes.Status400BadRequest
                        };

                        return new BadRequestObjectResult(problemDetails);
                    };
                });
            services.AddCors();

            services.AddOpenApi(options =>
            {
                options.AddDocumentTransformer((document, context, cancellationToken) =>
                {
                    document.Info.Title = "RegEx Tester API";
                    document.Info.Version = "v1";
                    document.Info.Description = "REST API for testing .NET regular expressions. Accepts a pattern, input text, and option flags; returns all matches with their groups and captures. Supports URL-based sharing via Base64Url-encoded query parameters.";
                    document.Info.Contact = new Microsoft.OpenApi.OpenApiContact
                    {
                        Name = "RegEx Tester",
                        Url = new Uri("https://regextester.github.io/")
                    };
                    return System.Threading.Tasks.Task.CompletedTask;
                });
            });

            services.AddTransient<IRegExProcessor, RegExProcessor>();
            services.AddSingleton<ITelemetryService>(sp =>
                new TelemetryService(
                    Configuration["Cosmos:Endpoint"],
                    Configuration["Cosmos:Database"],
                    Configuration["Cosmos:Container"],
                    sp.GetRequiredService<ILogger<TelemetryService>>())
            );
        }

        // This method gets called by the runtime. Use this method to configure the HTTP request pipeline.
        public void Configure(IApplicationBuilder app, IWebHostEnvironment env)
        {
            // Resolved eagerly so the Cosmos handshake runs here, on the startup path, rather than
            // lazily during the first POST /api/regex — which would both delay that request and, on
            // the other engines' equivalent, lose its telemetry entirely.
            app.ApplicationServices.GetRequiredService<ITelemetryService>();

            if (env.IsDevelopment())
            {
                app.UseDeveloperExceptionPage();
            }

            // Registered immediately after (so, in the middleware chain, immediately *inside*)
            // UseDeveloperExceptionPage: that middleware swallows exceptions itself (to render its
            // own error page) rather than rethrowing them, so our handler must sit closer to the
            // throw site than it does or it would never see the exception. Kestrel throws this
            // exception while the request body is being read, which happens during model binding
            // further down the pipeline, so it surfaces here as an exception from `next()`. This
            // guarantees a request that exceeds Kestrel's MaxRequestBodySize never leaks a raw
            // BadHttpRequestException stack trace (as HTML or plain text) to the client, in any
            // environment - including Development, where UseDeveloperExceptionPage would otherwise
            // render one.
            app.Use(async (context, next) =>
            {
                try
                {
                    await next();
                }
                catch (Exception ex) when (IsRequestBodyTooLargeException(ex))
                {
                    if (!context.Response.HasStarted)
                    {
                        context.Response.Clear();
                        context.Response.StatusCode = StatusCodes.Status413PayloadTooLarge;
                        context.Response.ContentType = "application/problem+json";
                        var problemDetails = new ProblemDetails
                        {
                            Type = "https://tools.ietf.org/html/rfc9110#section-15.5.14",
                            Title = "The request body is too large.",
                            Status = StatusCodes.Status413PayloadTooLarge
                        };
                        await context.Response.WriteAsync(JsonSerializer.Serialize(problemDetails, TimeoutResponseJsonOptions));
                    }
                }
            });

            app.UseCors(
                builder =>
                {
                    var allowedOrigins = Configuration.GetSection("AllowCors").Get<string[]>() ?? Array.Empty<string>();
                    builder
                        .AllowAnyHeader()
                        .AllowAnyMethod();

                    if (env.IsDevelopment())
                    {
                        // Reflect the specific request origin (never a blanket wildcard) for the
                        // configured allow-list plus any localhost origin, so local frontend dev
                        // servers on arbitrary ports work without granting access to the whole
                        // internet. AllowAnyOrigin() is incompatible with credentials and would
                        // hand out `Access-Control-Allow-Origin: *` to any origin, including
                        // untrusted ones - a genuine security weakness, not just a Dev convenience.
                        builder.SetIsOriginAllowed(origin =>
                            allowedOrigins.Contains(origin) ||
                            Uri.TryCreate(origin, UriKind.Absolute, out var originUri) &&
                                (originUri.Scheme == Uri.UriSchemeHttp || originUri.Scheme == Uri.UriSchemeHttps) &&
                                originUri.Host == "localhost");
                    }
                    else
                    {
                        builder.WithOrigins(allowedOrigins);
                    }
                }
            );
            app.UseResponseCaching();

            app.UseHttpsRedirection();

            app.UseRouting();

            // The contract requires the 5-second HTTP request timeout to surface as HTTP 200 with an
            // error body, never HTTP 408 (or any other error status). ASP.NET Core's built-in
            // AddRequestTimeouts/UseRequestTimeouts middleware only intercepts requests whose downstream
            // code observes the linked CancellationToken; RegExProcessor performs synchronous, CPU-bound
            // regex matching (bounded only by its own internal 15s match timeout) and never checks a
            // token, so that middleware would never fire here. Instead, race the rest of the pipeline
            // against a plain timer: whichever finishes first "wins", and a still-running request is left
            // to finish in the background (bounded by the 15s regex timeout) with its result discarded.
            app.Use(async (context, next) =>
            {
                var requestTask = next(context);
                var timeoutTask = Task.Delay(RequestTimeout);
                var completed = await Task.WhenAny(requestTask, timeoutTask);

                if (completed == timeoutTask && !context.Response.HasStarted)
                {
                    context.Response.StatusCode = StatusCodes.Status200OK;
                    context.Response.ContentType = "application/json";
                    var body = new RegexResult
                    {
                        Error = "The request timed out (exceeded 5 seconds).",
                        Replace = null,
                        Matches = new List<MatchResult>()
                    };
                    await context.Response.WriteAsync(JsonSerializer.Serialize(body, TimeoutResponseJsonOptions));

                    // Observe the abandoned request task's eventual completion/exception so it never
                    // surfaces as an unobserved task exception once it finishes in the background.
                    _ = requestTask.ContinueWith(t => _ = t.Exception, TaskScheduler.Default);
                }
                else
                {
                    await requestTask;
                }
            });

            app.UseAuthorization();

            app.UseEndpoints(endpoints =>
            {
                endpoints.MapOpenApi();
                endpoints.MapScalarApiReference();
                endpoints.MapControllers();
            });
        }

        /// <summary>
        /// Detects Kestrel's "request body too large" exception without a hard compile-time
        /// dependency on its concrete type, which lives in an internal namespace
        /// (<c>Microsoft.AspNetCore.Server.Kestrel.Core.BadHttpRequestException</c>) rather than the
        /// public <c>Microsoft.AspNetCore.Http.BadHttpRequestException</c>. Both shapes expose a
        /// public <c>int StatusCode</c> property, so match on that reflectively instead.
        /// </summary>
        private static bool IsRequestBodyTooLargeException(Exception ex)
        {
            if (ex.GetType().Name != "BadHttpRequestException")
            {
                return false;
            }

            var statusCodeProperty = ex.GetType().GetProperty("StatusCode");
            return statusCodeProperty?.GetValue(ex) is int statusCode &&
                statusCode == StatusCodes.Status413PayloadTooLarge;
        }
    }
}
