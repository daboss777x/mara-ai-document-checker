import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Monorepo root (pnpm workspace). Stops Next from picking up stray lockfiles higher up.
  outputFileTracingRoot: path.join(import.meta.dirname, ".."),
};

export default nextConfig;
