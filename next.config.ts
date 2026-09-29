import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // exceljs is CommonJS and reaches for Node built-ins; leave it to Node.
  serverExternalPackages: ["exceljs"],
  // This repo keeps its own README and agent guidance; do not generate more.
  agentRules: false,
};

export default nextConfig;
