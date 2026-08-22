/**
 * Loads env files before anything imports @reclaimr/api/services (whose
 * env() validates lazily but caches): local worker env first, then the
 * monorepo root (the cwd when turbo runs package tasks).
 */
export function loadEnvFiles(): void {
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
