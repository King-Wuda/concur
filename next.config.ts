import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // exceljs is CommonJS and reaches for Node built-ins; leave it to Node.
  serverExternalPackages: ["exceljs"],
  // This repo keeps its own README and agent guidance; do not generate more.
  agentRules: false,
  // The budget used to be the whole app. Old bookmarks and home-screen links
  // land in its new section; query strings (?m=) carry over.
  async redirects() {
    return [
      { source: "/capture", destination: "/budget/add", permanent: false },
      { source: "/receipts", destination: "/budget/receipts", permanent: false },
      { source: "/plan", destination: "/budget/plan", permanent: false },
    ];
  },
};

export default nextConfig;
