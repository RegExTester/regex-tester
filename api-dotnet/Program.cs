using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Hosting;

namespace RegExTester.Api.DotNet
{
    public class Program
    {
        public static void Main(string[] args)
        {
            CreateHostBuilder(args).Build().Run();
        }

        public static IHostBuilder CreateHostBuilder(string[] args) =>
            Host.CreateDefaultBuilder(args)
                .ConfigureWebHostDefaults(webBuilder =>
                {
                    webBuilder.UseStartup<Startup>()
                        .ConfigureKestrel(options =>
                        {
                            // Fits the maximum valid payload (pattern 512 + text 1024 + replace 1024
                            // chars, plus JSON overhead and multi-byte UTF-8) while still bounding
                            // request size for DoS protection.
                            options.Limits.MaxRequestBodySize = 8192; // 8 KB
                        });
                });
    }
}
