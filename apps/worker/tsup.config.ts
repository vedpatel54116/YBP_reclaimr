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
});
