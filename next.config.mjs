/** @type {import("next").NextConfig} */
const nextConfig = {
  webpack(config) {
    config.resolve.extensionAlias = {
      ".js": [".js", ".ts", ".tsx"],
    };
    return config;
  },
  async rewrites() {
    return [
      { source: "/", destination: "/api/index" },
      { source: "/dashboard", destination: "/api/index" },
      { source: "/levels", destination: "/api/index" },
      { source: "/interest-rate-schedule", destination: "/api/index" },
      { source: "/concepts", destination: "/api/index" },
      { source: "/economic-indicators", destination: "/api/index" },
      { source: "/economic-indicators/:path*", destination: "/api/index" },
      { source: "/secret-indicators", destination: "/api/index" },
      { source: "/secret-indicators/:path*", destination: "/api/index" },
      { source: "/fed_report_sh", destination: "/api/index" }
    ];
  }
};

export default nextConfig;
