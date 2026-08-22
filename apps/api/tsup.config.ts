import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/services.ts"],
  format: ["esm"],
  target: "node20",
  outDir: "dist",
  sourcemap: true,
  clean: true,
  // Internal packages ship TypeScript source, so bundle them in to keep
  // `node dist/*.js` runnable without a TS loader. Prisma, BullMQ, Fastify
  // and friends stay external — they are real runtime dependencies.
  noExternal: ["@reclaimr/shared", "@reclaimr/core", "@reclaimr/queue"],
});
