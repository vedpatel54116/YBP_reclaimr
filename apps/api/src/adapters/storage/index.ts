import type { Env } from "../../env";
import { LocalStorageAdapter } from "./local-adapter";
import type { StorageAdapter } from "./types";

export { LocalStorageAdapter } from "./local-adapter";
export { StorageError, type StorageAdapter } from "./types";

/**
 * Storage composition root.
 *
 * Only a filesystem adapter ships today, backed by STATEMENT_STORAGE_DIR. This
 * is the single place to swap in object storage: implement the three-method
 * `StorageAdapter` port against S3/GCS/R2 and select it here on configuration,
 * exactly as `createPlaidAdapter` chooses between the live and mock
 * aggregators. Nothing above this line knows where bytes live.
 *
 * A filesystem adapter assumes one writer with a durable volume. Running
 * multiple API replicas against local disk would scatter statements across
 * machines, so multi-replica deployments must supply an object-storage adapter
 * (see docs/DEPLOYMENT.md).
 */
export function createStorageAdapter(config: Env): StorageAdapter {
  return new LocalStorageAdapter(config.STATEMENT_STORAGE_DIR);
}
