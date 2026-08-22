/**
 * Object storage port for member-uploaded documents.
 *
 * Deliberately three methods. Statements are write-once, read-rarely evidence,
 * so nothing here needs listing, copying, or partial reads — which means an
 * S3/GCS/R2 adapter is a genuine drop-in rather than a partial fit. See
 * `./index.ts` for the swap point.
 */
export interface StorageAdapter {
  /** Store bytes under `key`, overwriting any existing object. */
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

/** Storage failure, mirroring the shape of PlaidAdapterError. */
export class StorageError extends Error {
  constructor(
    message: string,
    readonly code: "not_found" | "invalid_key" | "io_error",
    readonly reason?: unknown,
  ) {
    super(message);
    this.name = "StorageError";
  }
}
