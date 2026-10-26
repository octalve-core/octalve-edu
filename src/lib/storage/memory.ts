import { assertContentType, assertStorageKey } from "./keys";
import { DEFAULT_MAX_BYTES, StorageError, type ImageStore, type StoreCheck, type StoredObject } from "./types";

// Kept in the process's memory. For tests only: config.ts refuses it on a production-shaped server unless the test harness says so, because it loses everything on a restart
// and (on a serverless host) is not shared between requests.
export class MemoryImageStore implements ImageStore {
  readonly name = "memory" as const;
  private readonly objects = new Map<string, StoredObject>();

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    this.objects.set(assertStorageKey(key), { bytes: new Uint8Array(bytes), contentType: assertContentType(contentType) });
  }

  async get(key: string, maxBytes = DEFAULT_MAX_BYTES): Promise<StoredObject | null> {
    const found = this.objects.get(assertStorageKey(key));
    if (!found) return null;
    if (found.bytes.byteLength > maxBytes) throw new StorageError("The stored object is larger than the allowed size.");
    return { bytes: new Uint8Array(found.bytes), contentType: found.contentType };
  }

  async remove(key: string): Promise<void> {
    this.objects.delete(assertStorageKey(key));
  }

  async check(): Promise<StoreCheck> {
    return { ok: true };
  }

  /// Test helper: how many objects are held.
  get size(): number {
    return this.objects.size;
  }
}
