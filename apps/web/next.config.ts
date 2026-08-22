import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source (internal-package pattern);
  // compile them as part of the app bundle.
  transpilePackages: ["@reclaimr/shared", "@reclaimr/ui"],
  // A stray lockfile in $HOME makes Next infer the wrong workspace root;
  // pin it to this app so build tracing and `next start` resolve .next here.
  outputFileTracingRoot: path.resolve(__dirname),
  // Linting runs through the root flat ESLint config via `pnpm lint`
  // (turbo), not during `next build`.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
