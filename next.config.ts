import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    // Explicitly set the project root so Turbopack doesn't pick up the
    // parent repo's pnpm-lock.yaml when there are multiple lockfiles.
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
