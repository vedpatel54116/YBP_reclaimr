import { buildApp } from "./app";
import { env } from "./env";

/**
 * Loads env files without extra dependencies: a local `apps/api/.env` first,
 * then the monorepo root `.env` (the cwd when turbo runs package tasks).
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

async function main(): Promise<void> {
  loadEnvFiles();

  const config = env();
  const app = await buildApp();

  try {
    await app.listen({ port: config.API_PORT, host: "0.0.0.0" });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      app.log.info({ signal }, "Shutting down");
      // app.close() runs onClose hooks: Prisma disconnects, Redis quits.
      void app.close().finally(() => process.exit(0));
    });
  }
}

void main();
