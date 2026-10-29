import crypto from "node:crypto";
import { assertContentType, assertStorageKey } from "./keys";
import { DEFAULT_MAX_BYTES, StorageError, type ImageStore, type StoreCheck, type StoredObject } from "./types";

// Cloudinary, through the vendor's official `cloudinary` package. S3 and R2 are written by hand because that client can be PROVEN here (AWS publishes worked signing examples and a
// stand-in server can recompute every signature). Cloudinary's signing cannot be checked without an account, so its own implementation is used for the three things that need it:
// uploading (a signed multipart upload), deleting, and the signed, time-limited, API-served download link (`private_download_url`). What this file adds is what the vendor's package
// does not decide for us:
//
// * Every asset is `type: "authenticated"`: it has no public URL at all. The bytes are fetched by THIS server from the download link and streamed out by our own route after the
//   access check; the browser never sees a Cloudinary address (the ImageStore interface has no method that returns one).
// * The credentials are passed on every call, never read from the package's global configuration, so what this deployment is configured with is what is used.
// * The download link carries the API key and a signature: it is never logged, never put in an error and never followed anywhere but `https://*.cloudinary.com`.
// * Cloudinary names an image by `public_id` WITHOUT an extension, and the original format is part of the download request. A storage key therefore has to end in the image's
//   extension (`aleemaan/question-bank/<id>.png`): the extension is the format, and it must agree with the content type given to `put`.
//
// The package is loaded on first use, so a deployment that does not use Cloudinary never loads it.

export type CloudinarySettings = { cloudName: string; apiKey: string; apiSecret: string };

/// The part of the vendor's package this adapter uses. Tests replace it; the default is built from the real package.
export type CloudinaryClient = {
  upload(file: string, options: Record<string, unknown>): Promise<unknown>;
  destroy(publicId: string, options: Record<string, unknown>): Promise<unknown>;
  privateDownloadUrl(publicId: string, format: string, options: Record<string, unknown>): string;
};

export type CloudinaryOptions = { client?: CloudinaryClient; fetch?: typeof fetch; now?: () => Date; timeoutMs?: number };

const FORMATS: Record<string, { format: "jpg" | "png" | "webp"; contentType: string }> = {
  jpg: { format: "jpg", contentType: "image/jpeg" },
  jpeg: { format: "jpg", contentType: "image/jpeg" },
  png: { format: "png", contentType: "image/png" },
  webp: { format: "webp", contentType: "image/webp" },
};

/// A key's Cloudinary public id and original format. The key has to end in a known image extension; no segment may look like a version (`v123`), which Cloudinary reads as one.
export function parseCloudinaryKey(key: string): { publicId: string; format: "jpg" | "png" | "webp"; contentType: string } {
  const clean = assertStorageKey(key);
  const dot = clean.lastIndexOf(".");
  const known = dot > 0 ? FORMATS[clean.slice(dot + 1)] : undefined;
  if (!known) throw new StorageError("The cloudinary store keeps images only: the key must end in .jpg, .png or .webp.");
  const publicId = clean.slice(0, dot);
  if (publicId.split("/").some((segment) => /^v\d+$/.test(segment) || segment.endsWith(".")))
    throw new StorageError("That key cannot be a cloudinary public id.");
  return { publicId, ...known };
}

// Only the Cloudinary API host (or a Cloudinary host it redirects to) may be fetched, over https, whatever a link or a redirect says.
const allowedHost = (url: URL) =>
  url.protocol === "https:" && (url.hostname === "cloudinary.com" || url.hostname.endsWith(".cloudinary.com"));
const MAX_REDIRECTS = 3;
const LINK_LIFETIME_SECONDS = 60;

// A 1x1 transparent PNG: Cloudinary refuses an upload that is not an image, so the health check needs a real one.
const PROBE_PNG = Uint8Array.from(
  Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64"),
);

async function sdkClient(): Promise<CloudinaryClient> {
  // Bundled by Next or loaded natively by Node, the package's `v2` is a named export or on `default`.
  const loaded = (await import("cloudinary")) as unknown as {
    v2?: typeof import("cloudinary").v2;
    default?: { v2?: typeof import("cloudinary").v2 };
  };
  const v2 = loaded.v2 ?? loaded.default?.v2;
  if (!v2) throw new StorageError("The cloudinary package could not be loaded.");
  return {
    // the package types its options narrowly and leaves out the per-call credentials it does accept
    upload: (file, options) => v2.uploader.upload(file, options as never),
    destroy: (publicId, options) => v2.uploader.destroy(publicId, options as never),
    privateDownloadUrl: (publicId, format, options) => v2.utils.private_download_url(publicId, format, options as never),
  };
}

export class CloudinaryImageStore implements ImageStore {
  readonly name = "cloudinary" as const;
  private readonly settings: CloudinarySettings;
  private readonly injected?: CloudinaryClient;
  private client?: Promise<CloudinaryClient>;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;
  private readonly timeoutMs: number;

  constructor(settings: CloudinarySettings, options: CloudinaryOptions = {}) {
    this.settings = settings;
    this.injected = options.client;
    this.fetchImpl = options.fetch ?? fetch;
    this.now = options.now ?? (() => new Date());
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  private getClient(): Promise<CloudinaryClient> {
    return this.injected ? Promise.resolve(this.injected) : (this.client ??= sdkClient());
  }

  // The credentials, on every call. `timeout` is the package's own request timeout (milliseconds).
  private callOptions(extra: Record<string, unknown>): Record<string, unknown> {
    return {
      cloud_name: this.settings.cloudName,
      api_key: this.settings.apiKey,
      api_secret: this.settings.apiSecret,
      resource_type: "image",
      type: "authenticated",
      // Cloudinary accepts SHA-1 and SHA-256 signatures (an account can be restricted to SHA-256); the stronger one is always accepted
      signature_algorithm: "sha256",
      timeout: this.timeoutMs,
      ...extra,
    };
  }

  // The vendor's errors are plain objects whose message can contain the string that was signed: only the status is kept.
  private failure(action: string, error: unknown): StorageError {
    if (error instanceof StorageError) return error;
    const status =
      typeof (error as { http_code?: unknown } | null)?.http_code === "number" ? (error as { http_code: number }).http_code : null;
    const timedOut = status === 499 || (error as { name?: unknown } | null)?.name === "TimeoutError";
    return new StorageError(
      timedOut
        ? `The cloudinary storage did not answer in time.`
        : `The cloudinary storage refused to ${action}${status ? ` (HTTP ${status})` : ""}.`,
      status,
    );
  }

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    const { publicId, contentType: expected } = parseCloudinaryKey(key);
    assertContentType(contentType);
    if (contentType !== expected) throw new StorageError("The content type does not match the extension of the key.");
    const client = await this.getClient();
    try {
      await client.upload(
        `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`,
        this.callOptions({ public_id: publicId, overwrite: true, invalidate: true, unique_filename: false, use_filename: false }),
      );
    } catch (error) {
      throw this.failure("save the object", error);
    }
  }

  async get(key: string, maxBytes = DEFAULT_MAX_BYTES): Promise<StoredObject | null> {
    const { publicId, format, contentType } = parseCloudinaryKey(key);
    const client = await this.getClient();
    let link: string;
    try {
      const seconds = Math.floor(this.now().getTime() / 1000);
      // `timestamp` is what the signature is made at; `expires_at` is when the link stops working
      link = client.privateDownloadUrl(
        publicId,
        format,
        this.callOptions({ timestamp: seconds, expires_at: seconds + LINK_LIFETIME_SECONDS }),
      );
    } catch (error) {
      throw this.failure("sign the download", error);
    }
    const res = await this.fetchBounded(link);
    if (res === null) return null;
    const declared = Number(res.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maxBytes) {
      await res.body?.cancel();
      throw new StorageError("The stored object is larger than the allowed size.");
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    const reader = res.body?.getReader();
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          throw new StorageError("The stored object is larger than the allowed size.");
        }
        chunks.push(value);
      }
    }
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.byteLength;
    }
    // The type comes from OUR record of the key, never from what the far end says.
    return { bytes: out, contentType };
  }

  /// Follows at most MAX_REDIRECTS redirects, and only to https Cloudinary hosts. A 404 is "no such object"; anything else but 200 is an error. The link is never in a message.
  private async fetchBounded(link: string): Promise<Response | null> {
    let current = new URL(link);
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (!allowedHost(current)) throw new StorageError("The cloudinary storage sent the download somewhere that is not Cloudinary.");
      let res: Response;
      try {
        res = await this.fetchImpl(current, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(this.timeoutMs) });
      } catch (error) {
        const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
        throw new StorageError(
          timedOut ? "The cloudinary storage did not answer in time." : "The cloudinary storage could not be reached.",
        );
      }
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const location = res.headers.get("location");
        await res.body?.cancel();
        if (!location) throw new StorageError("The cloudinary storage sent a redirect with nowhere to go.");
        try {
          current = new URL(location, current);
        } catch {
          throw new StorageError("The cloudinary storage sent an unusable redirect.");
        }
        continue;
      }
      if (res.status === 404) {
        await res.body?.cancel();
        return null;
      }
      if (res.status !== 200) {
        await res.body?.cancel();
        throw new StorageError(`The cloudinary storage refused to read the object (HTTP ${res.status}).`, res.status);
      }
      return res;
    }
    throw new StorageError("The cloudinary storage redirected too many times.");
  }

  async remove(key: string): Promise<void> {
    const { publicId } = parseCloudinaryKey(key);
    const client = await this.getClient();
    let result: unknown;
    try {
      result = await client.destroy(publicId, this.callOptions({ invalidate: true }));
    } catch (error) {
      throw this.failure("delete the object", error);
    }
    // "not found" is fine: deleting what is not there is not an error
    const outcome = (result as { result?: unknown } | null)?.result;
    if (outcome !== "ok" && outcome !== "not found")
      throw new StorageError("The cloudinary storage answered something unexpected to a delete.");
  }

  async check(): Promise<StoreCheck> {
    const key = `health-check/${crypto.randomBytes(8).toString("hex")}.png`;
    try {
      await this.put(key, PROBE_PNG, "image/png");
      const back = await this.get(key, 4096);
      await this.remove(key);
      if (!back || back.bytes.byteLength !== PROBE_PNG.byteLength)
        return { ok: false, reason: "The probe image was saved but could not be read back." };
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: error instanceof StorageError ? error.message : "The storage check failed." };
    }
  }
}
