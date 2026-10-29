// Where uploaded images (and later other files) are kept. One small interface, several backends, chosen by the environment (config.ts). The caller never learns a URL: there
// is NO method that returns one, on purpose. Every read goes through our own route, which checks who may see the thing first (a question bank image can belong to an unreleased
// exam question), so no backend can hand out a link that outlives that check.

/// The backends. `r2` (Cloudflare R2) speaks the S3 protocol, so it is the `s3` code with R2's endpoint and region. `cloudinary` uses the vendor's package (cloudinary.ts).
export const STORE_NAMES = ["s3", "r2", "cloudinary", "memory"] as const;
export type StoreName = (typeof STORE_NAMES)[number];

export type StoredObject = { bytes: Uint8Array; contentType: string };

export type StoreCheck = { ok: true } | { ok: false; reason: string };

export interface ImageStore {
  readonly name: StoreName;
  /// Saves `bytes` under `key` (replacing what is there). Resolves when the backend has acknowledged it.
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /// The object, or null when there is none. Refuses (StorageError) anything larger than `maxBytes` (default 5 MB) without reading all of it.
  get(key: string, maxBytes?: number): Promise<StoredObject | null>;
  /// Deletes the object. Deleting what is not there is not an error.
  remove(key: string): Promise<void>;
  /// Writes, reads back and deletes a tiny probe object: proves the credentials, the bucket and the network, not only that variables are set.
  check(): Promise<StoreCheck>;
}

/// The environment does not name a usable store (nothing set, an unknown name, incomplete credentials, `memory` in production). Routes answer it with a 503.
export class StorageNotConfiguredError extends Error {
  readonly code = "STORAGE_NOT_CONFIGURED" as const;
  constructor(problem: string) {
    super(`STORAGE_NOT_CONFIGURED: ${problem}`);
    this.name = "StorageNotConfiguredError";
  }
}

/// A backend refused, was unreachable, timed out or answered something unexpected. The message never contains a credential, a signature or a query string.
export class StorageError extends Error {
  readonly code = "STORAGE_FAILED" as const;
  readonly status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "StorageError";
    this.status = status;
  }
}

/// A key that is not a plain relative path of safe segments (see keys.ts).
export class InvalidStorageKeyError extends Error {
  readonly code = "STORAGE_KEY" as const;
  constructor() {
    super("STORAGE_KEY: not a valid storage key");
    this.name = "InvalidStorageKeyError";
  }
}

export const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
