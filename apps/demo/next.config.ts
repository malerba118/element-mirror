import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The workspace packages point their exports at TypeScript source so the
  // demo runs against them with no build-watch step; Next transpiles them
  // like app code. Publishing swaps the exports to dist (publishConfig).
  transpilePackages: ["@frostin/element-mirror", "@frostin/snapdom"],
};

export default nextConfig;
