import crypto from "node:crypto";
import { assertContentType, assertStorageKey } from "./keys";
import { DEFAULT_MAX_BYTES, StorageError, type ImageStore, type StoreCheck, type StoredObject } from "./types";

// Amazon S3 and anything that speaks its protocol (Cloudflare R2, MinIO, ...), with no SDK: AWS Signature Version 4 done here with node:crypto and the platform `fetch`.
// `signV4` is checked against the worked example in AWS's own documentation (tests/unit/storage-sigv4.spec.ts), and the object calls against a local stand-in server that
// recomputes every signature from what it actually received (tests/unit/storage-s3.spec.ts), so what is signed is what is sent.

export type S3Settings = {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /// A custom endpoint (R2, MinIO) is used path-style: `<endpoint>/<bucket>/<key>`. Without one, Amazon's virtual-hosted address is used.
  endpoint?: string;
};

export type S3Options = { fetch?: typeof fetch; now?: () => Date; timeoutMs?: number };

const sha256Hex = (data: Uint8Array | string) => crypto.createHash("sha256").update(data).digest("hex");
const hmac = (key: Buffer | string, data: string) => crypto.createHmac("sha256", key).update(data).digest();

export type SignInput = {
  method: string;
  /// The Host the request is sent to, with the port when it is not the default.
  host: string;
  /// The path as it is sent (already percent-encoded, starting with "/").
  path: string;
  /// The query string as it is sent, without "?" ("" for none).
  query?: string;
  /// Headers to sign besides host, x-amz-content-sha256 and x-amz-date (which are always signed).
  headers?: Record<string, string>;
  /// Hex SHA-256 of the body.
  payloadHash: string;
  region: string;
  service?: string;
  accessKeyId: string;
  secretAccessKey: string;
  date: Date;
};

export type Signed = { amzDate: string; authorization: string; signedHeaders: string; canonicalRequest: string };

export function signV4(input: SignInput): Signed {
  const service = input.service ?? "s3";
  const amzDate = input.date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);

  const headers: Record<string, string> = { host: input.host, "x-amz-content-sha256": input.payloadHash, "x-amz-date": amzDate };
  for (const [name, value] of Object.entries(input.headers ?? {})) headers[name.toLowerCase()] = value;
  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map((n) => `${n}:${headers[n].trim().replace(/\s+/g, " ")}\n`).join("");
  const signedHeaders = names.join(";");

  const canonicalQuery = (input.query ?? "")
    .split("&")
    .filter(Boolean)
    .map((pair) => {
      const [k, ...rest] = pair.split("=");
      return [k, rest.join("=")] as const;
    })
    .sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  const canonicalRequest = [input.method, input.path, canonicalQuery, canonicalHeaders, signedHeaders, input.payloadHash].join("\n");
  const scope = `${dateStamp}/${input.region}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${input.secretAccessKey}`, dateStamp), input.region), service), "aws4_request");
  const signature = crypto.createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  const authorization = `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return { amzDate, authorization, signedHeaders, canonicalRequest };
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

export class S3ImageStore implements ImageStore {
  readonly name: "s3" | "r2";
  private readonly settings: S3Settings;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;
  private readonly timeoutMs: number;
  private readonly base: URL;

  constructor(name: "s3" | "r2", settings: S3Settings, options: S3Options = {}) {
    this.name = name;
    this.settings = settings;
    this.fetchImpl = options.fetch ?? fetch;
    this.now = options.now ?? (() => new Date());
    this.timeoutMs = options.timeoutMs ?? 10_000;
    if (settings.endpoint) {
      this.base = new URL(settings.endpoint);
      // Credentials and signed requests only ever travel over TLS, except to this machine (a local stand-in server in tests).
      if (this.base.protocol !== "https:" && !(this.base.protocol === "http:" && LOOPBACK.has(this.base.hostname)))
        throw new StorageError("The storage endpoint must be an https address.");
    } else {
      this.base = new URL(`https://${settings.bucket}.s3.${settings.region}.amazonaws.com`);
    }
  }

  private target(key: string): { url: URL; path: string } {
    const clean = assertStorageKey(key);
    const path = this.settings.endpoint ? `${this.base.pathname.replace(/\/+$/, "")}/${this.settings.bucket}/${clean}` : `/${clean}`;
    // keys are made of characters that need no encoding, so the path is sent exactly as it is signed
    return { url: new URL(path, this.base), path };
  }

  private async send(method: "PUT" | "GET" | "DELETE", key: string, body?: Uint8Array, contentType?: string): Promise<Response> {
    const { url, path } = this.target(key);
    const payload = body ?? new Uint8Array(0);
    const signed = signV4({
      method,
      host: url.host,
      path,
      headers: contentType ? { "content-type": contentType } : undefined,
      payloadHash: sha256Hex(payload),
      region: this.settings.region,
      accessKeyId: this.settings.accessKeyId,
      secretAccessKey: this.settings.secretAccessKey,
      date: this.now(),
    });
    const headers: Record<string, string> = {
      "x-amz-date": signed.amzDate,
      "x-amz-content-sha256": sha256Hex(payload),
      authorization: signed.authorization,
    };
    if (contentType) headers["content-type"] = contentType;
    try {
      return await this.fetchImpl(url, {
        method,
        headers,
        body: method === "PUT" ? (Buffer.from(payload) as unknown as BodyInit) : undefined,
        redirect: "error",
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      // never include the URL, the headers or the underlying message: they can carry the host and the signature
      const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      throw new StorageError(
        timedOut
          ? `The ${this.name} storage did not answer in time.`
          : `The ${this.name} storage could not be reached (or answered with a redirect: check the region and endpoint).`,
      );
    }
  }

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    assertContentType(contentType);
    const res = await this.send("PUT", key, bytes, contentType);
    await res.body?.cancel();
    if (res.status !== 200) throw new StorageError(`The ${this.name} storage refused to save the object (HTTP ${res.status}).`, res.status);
  }

  async get(key: string, maxBytes = DEFAULT_MAX_BYTES): Promise<StoredObject | null> {
    const res = await this.send("GET", key);
    if (res.status === 404) {
      await res.body?.cancel();
      return null;
    }
    if (res.status !== 200) {
      await res.body?.cancel();
      throw new StorageError(`The ${this.name} storage refused to read the object (HTTP ${res.status}).`, res.status);
    }
    const declared = Number(res.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maxBytes) {
      await res.body?.cancel();
      throw new StorageError("The stored object is larger than the allowed size.");
    }
    // read at most maxBytes, whatever the headers claim
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
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { bytes, contentType: res.headers.get("content-type") ?? "application/octet-stream" };
  }

  async remove(key: string): Promise<void> {
    const res = await this.send("DELETE", key);
    await res.body?.cancel();
    if (res.status !== 204 && res.status !== 200 && res.status !== 404)
      throw new StorageError(`The ${this.name} storage refused to delete the object (HTTP ${res.status}).`, res.status);
  }

  async check(): Promise<StoreCheck> {
    const key = `health-check/${crypto.randomBytes(8).toString("hex")}`;
    const probe = new Uint8Array([111, 107]);
    try {
      await this.put(key, probe, "text/plain");
      const back = await this.get(key, 16);
      await this.remove(key);
      if (!back || back.bytes.byteLength !== 2) return { ok: false, reason: "The probe object was saved but could not be read back." };
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: error instanceof StorageError ? error.message : "The storage check failed." };
    }
  }
}
