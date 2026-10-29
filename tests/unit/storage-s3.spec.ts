import "../support/env";
import { test, expect } from "@playwright/test";
import http from "node:http";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import { InvalidStorageKeyError, MemoryImageStore, S3ImageStore, StorageError, signV4, type ImageStore } from "@/lib/storage";

// One contract, run against every backend we can run without a real account: the in-memory store and the S3 code (which is also the R2 code) talking to a local
// stand-in server. The stand-in does not trust the client: for every request it rebuilds the AWS signature from what it ACTUALLY received (method, path, the signed headers,
// the body's real hash) with the same secret and refuses a request that does not match, so a request signed for one thing and sent as another fails here, not at Amazon.
// What is NOT covered: a real Amazon, Cloudflare or MinIO server (that needs real credentials and is run by hand), only the protocol shape and our own signing.

const KEY_ID = "AKIAIOSFODNN7EXAMPLE";
const SECRET = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
const BUCKET = "school-images";

type Mode = "normal" | "forbidden" | "error" | "redirect" | "silent" | "chunked-huge";

type Seen = { method: string; url: string; signedHeaders: string; verified: boolean };

function startStub() {
  const objects = new Map<string, { bytes: Buffer; contentType: string }>();
  const seen: Seen[] = [];
  const state = { mode: "normal" as Mode };
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      const record: Seen = { method: req.method ?? "", url: req.url ?? "", signedHeaders: "", verified: false };
      seen.push(record);

      // 1. verify the signature from what was received
      const auth = String(req.headers.authorization ?? "");
      const m =
        /^AWS4-HMAC-SHA256 Credential=([^/]+)\/(\d{8})\/([^/]+)\/s3\/aws4_request, SignedHeaders=([a-z0-9;-]+), Signature=([0-9a-f]{64})$/.exec(
          auth,
        );
      let verified = false;
      if (m && m[1] === KEY_ID) {
        const [, , , region, signedHeaders, signature] = m;
        record.signedHeaders = signedHeaders;
        const extra: Record<string, string> = {};
        for (const name of signedHeaders.split(";"))
          if (!["host", "x-amz-content-sha256", "x-amz-date"].includes(name)) extra[name] = String(req.headers[name] ?? "");
        const payloadHash = String(req.headers["x-amz-content-sha256"]);
        const date = String(req.headers["x-amz-date"]);
        const parsed = new Date(
          `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${date.slice(9, 11)}:${date.slice(11, 13)}:${date.slice(13, 15)}Z`,
        );
        const [path, query = ""] = (req.url ?? "").split("?");
        const again = signV4({
          method: req.method ?? "",
          host: String(req.headers.host),
          path,
          query,
          headers: extra,
          payloadHash,
          region,
          accessKeyId: KEY_ID,
          secretAccessKey: SECRET,
          date: parsed,
        });
        const bodyHashOk = payloadHash === crypto.createHash("sha256").update(body).digest("hex");
        const fresh = Math.abs(Date.now() - parsed.getTime()) < 15 * 60 * 1000;
        verified = again.authorization.endsWith(`Signature=${signature}`) && bodyHashOk && fresh;
      }
      record.verified = verified;

      // 2. behave as configured
      if (state.mode === "silent") return; // never answer
      if (state.mode === "redirect") {
        res.writeHead(301, { location: "https://elsewhere.example/" }).end();
        return;
      }
      if (state.mode === "error") {
        res.writeHead(500).end("<Error>InternalError</Error>");
        return;
      }
      if (state.mode === "forbidden" || !verified) {
        res.writeHead(403).end("<Error>SignatureDoesNotMatch</Error>");
        return;
      }
      if (!(req.url ?? "").startsWith(`/${BUCKET}/`)) {
        res.writeHead(404).end("<Error>NoSuchBucket</Error>");
        return;
      }
      const key = (req.url ?? "").slice(BUCKET.length + 2);
      if (req.method === "PUT") {
        objects.set(key, { bytes: body, contentType: String(req.headers["content-type"] ?? "") });
        res.writeHead(200, { etag: '"x"' }).end();
      } else if (req.method === "DELETE") {
        objects.delete(key);
        res.writeHead(204).end();
      } else if (req.method === "GET") {
        if (state.mode === "chunked-huge") {
          res.writeHead(200, { "content-type": "image/png" }); // no content-length: chunked
          for (let i = 0; i < 40; i++) res.write(Buffer.alloc(8 * 1024, 1));
          res.end();
          return;
        }
        const found = objects.get(key);
        if (!found) res.writeHead(404).end("<Error>NoSuchKey</Error>");
        else res.writeHead(200, { "content-type": found.contentType, "content-length": found.bytes.length }).end(found.bytes);
      } else res.writeHead(405).end();
    });
  });
  return new Promise<{ endpoint: string; objects: typeof objects; seen: Seen[]; state: typeof state; close: () => Promise<void> }>(
    (resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const { port } = server.address() as AddressInfo;
        resolve({
          endpoint: `http://127.0.0.1:${port}`,
          objects,
          seen,
          state,
          close: () => new Promise<void>((done) => (server.closeAllConnections(), server.close(() => done()))),
        });
      });
    },
  );
}

const png = (n: number) => new Uint8Array(Array.from({ length: n }, (_, i) => i % 256));

function contract(label: string, make: () => Promise<{ store: ImageStore; requests: () => number; stop: () => Promise<void> }>) {
  test.describe(`${label}: the contract`, () => {
    let store: ImageStore;
    let requests: () => number;
    let stop: () => Promise<void>;
    test.beforeAll(async () => ({ store, requests, stop } = await make()));
    test.afterAll(async () => stop());

    test("saved bytes and content type come back exactly, including every byte value and an empty object; saving again replaces", async () => {
      const all = new Uint8Array(256).map((_, i) => i);
      await store.put("a/all-bytes", all, "image/png");
      const back = await store.get("a/all-bytes");
      expect(back?.contentType).toBe("image/png");
      expect(Buffer.from(back!.bytes).equals(Buffer.from(all))).toBe(true);
      await store.put("a/all-bytes", png(10), "image/jpeg");
      expect((await store.get("a/all-bytes"))?.bytes.byteLength).toBe(10);
      await store.put("a/empty", new Uint8Array(0), "image/webp");
      expect((await store.get("a/empty"))?.bytes.byteLength).toBe(0);
      await store.put("a/large", png(300 * 1024), "image/png");
      expect(Buffer.from((await store.get("a/large"))!.bytes).equals(Buffer.from(png(300 * 1024)))).toBe(true);
    });

    test("a missing object is null, not an error; deleting is idempotent and really deletes", async () => {
      expect(await store.get("a/never-written")).toBeNull();
      await store.put("a/to-delete", png(5), "image/png");
      await store.remove("a/to-delete");
      expect(await store.get("a/to-delete")).toBeNull();
      await expect(store.remove("a/to-delete")).resolves.toBeUndefined();
      await expect(store.remove("a/never-written")).resolves.toBeUndefined();
    });

    test("an object over maxBytes is refused instead of read", async () => {
      await store.put("a/big", png(5000), "image/png");
      await expect(store.get("a/big", 1000)).rejects.toThrow(StorageError);
      expect((await store.get("a/big", 5000))?.bytes.byteLength).toBe(5000);
    });

    test("a key that is not a safe relative path is refused by every method BEFORE anything is sent", async () => {
      const before = requests();
      for (const key of ["", "../x", "a/../b", "/a", "a/", "a b", "a%2e", "a\u0000", "é", "x".repeat(201)]) {
        await expect(store.put(key, png(1), "image/png"), JSON.stringify(key)).rejects.toThrow(InvalidStorageKeyError);
        await expect(store.get(key), JSON.stringify(key)).rejects.toThrow(InvalidStorageKeyError);
        await expect(store.remove(key), JSON.stringify(key)).rejects.toThrow(InvalidStorageKeyError);
      }
      expect(requests()).toBe(before);
    });

    test("a content type that could carry a header or is not a media type is refused before anything is sent", async () => {
      const before = requests();
      for (const type of ["", "image/png\r\nx-evil: 1", "text", "image/", "/png", "IMAGE/PNG", "image/png; charset=utf-8", "image png"])
        await expect(store.put("a/type", png(1), type), JSON.stringify(type)).rejects.toThrow(StorageError);
      expect(requests()).toBe(before);
    });

    test("check() writes, reads back and deletes a probe, and leaves nothing behind", async () => {
      expect(await store.check()).toEqual({ ok: true });
    });
  });
}

contract("memory", async () => {
  const store = new MemoryImageStore();
  return { store, requests: () => 0, stop: async () => undefined };
});

test.describe("S3 and R2 (one code path) against the signature-checking stand-in", () => {
  let stub: Awaited<ReturnType<typeof startStub>>;
  const make = (
    over: Partial<ConstructorParameters<typeof S3ImageStore>[1]> = {},
    opts: ConstructorParameters<typeof S3ImageStore>[2] = {},
    name: "s3" | "r2" = "s3",
  ) =>
    new S3ImageStore(
      name,
      { bucket: BUCKET, region: "auto", accessKeyId: KEY_ID, secretAccessKey: SECRET, endpoint: stub.endpoint, ...over },
      opts,
    );

  test.beforeAll(async () => {
    stub = await startStub();
  });
  test.afterAll(async () => stub.close());
  test.beforeEach(() => {
    stub.state.mode = "normal";
    stub.seen.length = 0;
  });

  contract("s3 against the stand-in", async () => {
    const s = await startStub();
    const store = new S3ImageStore("s3", {
      bucket: BUCKET,
      region: "eu-west-1",
      accessKeyId: KEY_ID,
      secretAccessKey: SECRET,
      endpoint: s.endpoint,
    });
    return { store, requests: () => s.seen.length, stop: () => s.close() };
  });
  contract("r2 against the stand-in", async () => {
    const s = await startStub();
    const store = new S3ImageStore("r2", {
      bucket: BUCKET,
      region: "auto",
      accessKeyId: KEY_ID,
      secretAccessKey: SECRET,
      endpoint: s.endpoint,
    });
    return { store, requests: () => s.seen.length, stop: () => s.close() };
  });

  test("every request is signed, the signature verifies against what was received, and the path is path-style `/<bucket>/<key>`", async () => {
    const store = make();
    await store.put("q/one", png(8), "image/png");
    await store.get("q/one");
    await store.remove("q/one");
    expect(stub.seen.map((s) => `${s.method} ${s.url}`)).toEqual([
      `PUT /${BUCKET}/q/one`,
      `GET /${BUCKET}/q/one`,
      `DELETE /${BUCKET}/q/one`,
    ]);
    expect(stub.seen.every((s) => s.verified)).toBe(true);
    expect(stub.seen[0].signedHeaders).toBe("content-type;host;x-amz-content-sha256;x-amz-date");
    expect(stub.seen[1].signedHeaders).toBe("host;x-amz-content-sha256;x-amz-date");
  });

  test("wrong credentials, a wrong secret and a clock an hour out are 403s the store reports as errors (never as 'not found')", async () => {
    await expect(make({ secretAccessKey: SECRET + "x" }).get("q/one")).rejects.toMatchObject({ code: "STORAGE_FAILED", status: 403 });
    await expect(make({ accessKeyId: "AKIAXXXXXXXXXXXXXXXX" }).put("q/one", png(1), "image/png")).rejects.toMatchObject({ status: 403 });
    await expect(make({}, { now: () => new Date(Date.now() - 3_600_000) }).get("q/one")).rejects.toMatchObject({ status: 403 });
    stub.state.mode = "forbidden";
    await expect(make().get("q/one")).rejects.toMatchObject({ status: 403 });
    await expect(make().remove("q/one")).rejects.toMatchObject({ status: 403 });
  });

  test("a 500, a redirect, a server that never answers and a server that is not there are StorageErrors that say nothing about credentials, hosts or signatures", async () => {
    const leaks = (message: string) =>
      [SECRET, KEY_ID, "127.0.0.1", "Signature", "AWS4", stub.endpoint].filter((needle) => message.includes(needle));
    stub.state.mode = "error";
    const err500 = await make()
      .put("q/e", png(1), "image/png")
      .catch((e) => e as Error);
    expect(err500).toBeInstanceOf(StorageError);
    expect(leaks((err500 as Error).message)).toEqual([]);
    stub.state.mode = "redirect";
    const redirect = await make()
      .get("q/e")
      .catch((e) => e as Error);
    expect(redirect).toBeInstanceOf(StorageError);
    expect(leaks((redirect as Error).message)).toEqual([]);
    stub.state.mode = "silent";
    const started = Date.now();
    const timeout = await make({}, { timeoutMs: 300 })
      .get("q/e")
      .catch((e) => e as Error);
    expect(timeout).toBeInstanceOf(StorageError);
    expect(Date.now() - started).toBeLessThan(3000);
    expect(leaks((timeout as Error).message)).toEqual([]);
    const gone = await make({ endpoint: "http://127.0.0.1:1" })
      .get("q/e")
      .catch((e) => e as Error);
    expect(gone).toBeInstanceOf(StorageError);
    expect(leaks((gone as Error).message)).toEqual([]);
  });

  test("a response with no length that keeps going is cut off at maxBytes, not buffered whole", async () => {
    stub.state.mode = "chunked-huge"; // 320 KB, no content-length
    await expect(make().get("q/huge", 10_000)).rejects.toThrow(/larger than the allowed size/);
    expect((await make().get("q/huge", 1_000_000))?.bytes.byteLength).toBe(40 * 8 * 1024);
  });

  test("the endpoint must be https, or http on this machine only; Amazon's own address is virtual-hosted and region-specific", async () => {
    expect(() => make({ endpoint: "http://minio.example.com" })).toThrow(StorageError);
    expect(() => make({ endpoint: "ftp://minio.example.com" })).toThrow();
    expect(() => make({ endpoint: "http://localhost:9000" })).not.toThrow();
    let url = "";
    const spy = (async (input: URL | string) => {
      url = String(input);
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;
    const amazon = new S3ImageStore(
      "s3",
      { bucket: "school-images", region: "eu-west-1", accessKeyId: KEY_ID, secretAccessKey: SECRET },
      { fetch: spy },
    );
    await amazon.put("a/b.png", png(1), "image/png");
    expect(url).toBe("https://school-images.s3.eu-west-1.amazonaws.com/a/b.png");
  });

  test("fuzz: 300 random objects and keys round-trip exactly, interleaved with deletes, and every request verified", async () => {
    let seed = 99;
    const next = () => {
      seed = (seed + 0x6d2b79f5) >>> 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const store = make();
    const model = new Map<string, Uint8Array>();
    const problems: string[] = [];
    for (let i = 0; i < 300; i++) {
      const key = `fuzz/${Math.floor(next() * 20)}/${Math.floor(next() * 5)}.bin`;
      const roll = next();
      if (roll < 0.5) {
        const bytes = new Uint8Array(Math.floor(next() * 400)).map(() => Math.floor(next() * 256));
        await store.put(key, bytes, "image/png");
        model.set(key, bytes);
      } else if (roll < 0.7) {
        await store.remove(key);
        model.delete(key);
      } else {
        const got = await store.get(key);
        const want = model.get(key);
        if (!want ? got !== null : !got || !Buffer.from(got.bytes).equals(Buffer.from(want)))
          problems.push(`mismatch at step ${i} for ${key}`);
      }
    }
    expect(problems).toEqual([]);
    expect(stub.seen.length).toBeGreaterThan(250);
    expect(stub.seen.filter((s) => !s.verified).length).toBe(0);
  });
});
