import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  outDir: "dist",
  sourcemap: true,
  clean: true,
  // Internal packages (and the API's service barrel) ship TypeScript source;
  // bundle them so the worker image runs on plain node. Prisma, BullMQ, and
  // Redis stay external — they are real runtime dependencies.
  noExternal: ["@reclaimr/shared", "@reclaimr/core", "@reclaimr/queue", "@reclaimr/api"],
  // Bundling @reclaimr/api pulls in Stripe, whose transitive dep `qs` does
  // require("util") at runtime. esbuild's ESM output replaces that with a shim
  // that throws `Dynamic require of "util" is not supported`, so the worker
  // crashed on boot. Defining a real CommonJS require makes the shim delegate
  // to it instead of throwing.
  //
  // The API image does not need this: it keeps Stripe external, so only the
  // worker (which bundles the API's service barrel) is affected.
  banner: {
    js: "import { createRequire as __nodeCreateRequire } from 'module';\nconst require = __nodeCreateRequire(import.meta.url);",
  },
});
