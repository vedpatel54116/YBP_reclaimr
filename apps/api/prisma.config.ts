import { defineConfig } from "prisma/config";

/**
 * With a Prisma config file present, the CLI no longer loads .env files
 * automatically. Mirror the loader in src/index.ts: local app env first, then
 * the monorepo root (the cwd when turbo runs package tasks).
 */
function loadEnvFiles(): void {
  if (typeof process.loadEnvFile !== "function") return;
  for (const candidate of [".env", "../../.env"]) {
    try {
      process.loadEnvFile(candidate);
      return;
    } catch {
      // No env file at this location; try the next candidate.
    }
  }
}

loadEnvFiles();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
});
