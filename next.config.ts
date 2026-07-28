import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  // Native/WASM database drivers must load via Node require, not the bundler.
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  // Runtime migrations read ./drizzle from process.cwd(); include it in the
  // output trace so serverless deployments ship the SQL files.
  outputFileTracingIncludes: {
    "/**/*": ["./drizzle/**/*"],
  },
};

export default nextConfig;
