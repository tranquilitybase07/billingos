import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  transpilePackages: ["geist"],
  turbopack: {
    root: path.resolve(__dirname, '../../'), // Point to monorepo root for workspace package resolution
  },
};

export default nextConfig;
