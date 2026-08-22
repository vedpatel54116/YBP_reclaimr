import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { StorageError, type StorageAdapter } from "./types";

/**
 * Filesystem-backed storage. Suitable for local development and single-node
 * self-hosted deployments where the base directory is a durable volume; swap
 * in an object-storage adapter for multi-replica production (see ./index.ts).
 */
export class LocalStorageAdapter implements StorageAdapter {
  private readonly root: string;

  constructor(baseDir: string) {
    this.root = resolve(baseDir);
  }

  /**
   * Resolve a key to an absolute path, refusing anything that escapes the
   * root. Keys are server-generated today, but this is the one boundary where
   * a traversal bug turns a file upload into arbitrary filesystem access, so it
   * is checked here rather than trusted from the caller.
   */
  private pathFor(key: string): string {
    if (!key || isAbsolute(key) || key.includes("\0")) {
      throw new StorageError(`Invalid storage key: ${key}`, "invalid_key");
    }
    const target = resolve(join(this.root, key));
    if (target !== this.root && !target.startsWith(this.root + sep)) {
      throw new StorageError(`Storage key escapes the storage root: ${key}`, "invalid_key");
    }
    return target;
  }

  async put(key: string, body: Buffer, _contentType: string): Promise<void> {
    const target = this.pathFor(key);
    try {
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, body);
    } catch (error) {
      throw new StorageError(`Failed to write ${key}`, "io_error", error);
    }
  }

  async get(key: string): Promise<Buffer> {
    const target = this.pathFor(key);
    try {
      return await readFile(target);
    } catch (error) {
      if (isMissing(error)) throw new StorageError(`No object at ${key}`, "not_found", error);
      throw new StorageError(`Failed to read ${key}`, "io_error", error);
    }
  }

  async delete(key: string): Promise<void> {
    const target = this.pathFor(key);
    try {
      // `force` makes deletion idempotent — cleaning up an object that was
      // never written is not an error.
      await rm(target, { force: true });
    } catch (error) {
      throw new StorageError(`Failed to delete ${key}`, "io_error", error);
    }
  }
}

function isMissing(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === "ENOENT";
}
