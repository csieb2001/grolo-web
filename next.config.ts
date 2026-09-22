import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Eigenständiges Serverbündel für das Container-Abbild im LXC (server.js plus nur die benötigten Module)
  output: "standalone",
};

export default nextConfig;
