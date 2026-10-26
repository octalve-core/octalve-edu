import "../support/env";
import crypto from "node:crypto";
import { test, expect } from "@playwright/test";
import { CloudinaryImageStore, InvalidStorageKeyError, StorageError, parseCloudinaryKey, type CloudinaryClient } from "@/lib/storage";

// The Cloudinary backend, without a Cloudinary account. Three kinds of test:
//   - behaviour and failure modes, against a fake client and a fake `fetch` (what the adapter promises whatever the far end does);
//   - the vendor's package itself, for the one thing a hand-written client could not be proven on: that its signatures are what Cloudinary's documentation says they are
//     (the documented worked examples, and an independent recomputation of the signature on the download link our adapter would send);
//   - the wiring between the two: the adapter, with no fake client, calling the package's own uploader and download-link functions with the right arguments.
// NOT covered here, and NOT run: any request to the real Cloudinary service (needs credentials). That is a manual step for the maintainer.

const SETTINGS = { cloudName: "school-demo", apiKey: "123456789012345", apiSecret: "aBcDeFgHiJkLmNoPqRsTuVwXyZ0" };
const NOW = new Date("2026-10-20T10:00:00.000Z");
const NOW_S = Math.floor(NOW.getTime() / 1000);
const png = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 7 + 3) & 255);

function fakeClient(over: Partial<CloudinaryClient> = {}) {
  const calls = {
    upload: [] as { file: string; options: Record<string, unknown> }[],
    destroy: [] as { publicId: string; options: Record<string, unknown> }[],
    url: [] as { publicId: string; format: string; options: Record<string, unknown> }[],
  };
  const client: CloudinaryClient = {
    upload: async (file, options) => {
      calls.upload.push({ file, options });
      return { public_id: options.public_id };
    },
    destroy: async (publicId, options) => {
      calls.destroy.push({ publicId, options });
      return { result: "ok" };
    },
    privateDownloadUrl: (publicId, format, options) => {
      calls.url.push({ publicId, format, options });
      return `https://api.cloudinary.com/v1_1/school-demo/image/download?public_id=${encodeURIComponent(publicId)}&format=${format}&signature=SECRETSIGNATURE&api_key=${SETTINGS.apiKey}`;
    },
    ...over,
  };
  return { client, calls };
}

type Handler = (url: URL, init?: RequestInit) => Response | Promise<Response>;
const fetchOf = (handler: Handler) => (async (input: unknown, init?: RequestInit) => handler(new URL(String(input)), init)) as typeof fetch;
const found = (bytes: Uint8Array, headers: Record<string, string> = {}) =>
  new Response(bytes as unknown as BodyInit, { status: 200, headers });
const redirect = (to: string, status = 302) => new Response(null, { status, headers: { location: to } });

/// Nothing an error says may contain a credential, a signature, the download link or the API host.
function expectNoLeak(error: unknown, label = "") {
  const text = `${(error as Error)?.message ?? ""} ${JSON.stringify(error)}`;
  for (const secret of [
    SETTINGS.apiSecret,
    SETTINGS.apiKey,
    "SECRETSIGNATURE",
    "api.cloudinary.com",
    "signature=",
    "v1_1",
    "String to sign",
  ])
    expect(text, `${label}: an error mentions ${secret}`).not.toContain(secret);
}
async function rejection(promise: Promise<unknown>): Promise<StorageError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(StorageError);
    expectNoLeak(error);
    return error as StorageError;
  }
  throw new Error("expected a rejection");
}

test("keys: a Cloudinary public id is the key without its extension, and the extension is the format", () => {
  expect(parseCloudinaryKey("aleemaan/question-bank/abc123.png")).toEqual({
    publicId: "aleemaan/question-bank/abc123",
    format: "png",
    contentType: "image/png",
  });
  expect(parseCloudinaryKey("a/b.jpg")).toMatchObject({ publicId: "a/b", format: "jpg", contentType: "image/jpeg" });
  expect(parseCloudinaryKey("a/b.jpeg")).toMatchObject({ publicId: "a/b", format: "jpg", contentType: "image/jpeg" });
  expect(parseCloudinaryKey("x.webp")).toMatchObject({ publicId: "x", format: "webp", contentType: "image/webp" });
  expect(parseCloudinaryKey("a.b.png")).toMatchObject({ publicId: "a.b" });
  for (const bad of [
    "a/b",
    "a/b.",
    "a/b.gif",
    "a/b.svg",
    "a/b.PNG",
    "a/b.png.exe",
    "a/b.txt",
    "a/b.html",
    "v123/a.png",
    "a/v1/b.png",
    "a./b.png",
  ])
    expect(() => parseCloudinaryKey(bad), bad).toThrow(StorageError);
  for (const bad of ["", "../a.png", "/a.png", "a//b.png", "a b.png", "a/%2e%2e/b.png", ".png", "a\u0000.png", "x".repeat(300) + ".png"])
    expect(() => parseCloudinaryKey(bad), bad).toThrow(InvalidStorageKeyError);
});

test("put: one signed, authenticated, overwriting upload with the credentials on the call, the bytes exactly, and the content type matching the key", async () => {
  const { client, calls } = fakeClient();
  const store = new CloudinaryImageStore(SETTINGS, { client });
  const bytes = png(2500);
  await store.put("aleemaan/question-bank/img1.png", bytes, "image/png");
  expect(calls.upload).toHaveLength(1);
  const [{ file, options }] = calls.upload;
  expect(file.startsWith("data:image/png;base64,")).toBe(true);
  expect(Uint8Array.from(Buffer.from(file.slice("data:image/png;base64,".length), "base64"))).toEqual(bytes);
  expect(options).toMatchObject({
    cloud_name: "school-demo",
    api_key: SETTINGS.apiKey,
    api_secret: SETTINGS.apiSecret,
    public_id: "aleemaan/question-bank/img1",
    type: "authenticated",
    resource_type: "image",
    overwrite: true,
    invalidate: true,
    unique_filename: false,
    use_filename: false,
    signature_algorithm: "sha256",
  });
  expect(typeof options.timeout).toBe("number");

  // the content type has to agree with the key's extension, and be a plain media type
  await expect(store.put("a/b.png", png(5), "image/jpeg")).rejects.toThrow(StorageError);
  await expect(store.put("a/b.jpg", png(5), "image/png")).rejects.toThrow(StorageError);
  await store.put("a/b.jpeg", png(5), "image/jpeg");
  await expect(store.put("a/b.png", png(5), "image/png; charset=utf-8")).rejects.toThrow(StorageError);
  await expect(store.put("a/b.png", png(5), "image/png\r\nX: y")).rejects.toThrow(StorageError);
  await expect(store.put("../b.png", png(5), "image/png")).rejects.toThrow(InvalidStorageKeyError);
  expect(calls.upload).toHaveLength(2); // only the valid ones reached the package
});

test("put: whatever the package throws becomes a StorageError that carries a status at most, never its text (which can include the string it signed)", async () => {
  const shapes: unknown[] = [
    { message: `Invalid Signature abc. String to sign - 'public_id=a&timestamp=1'. ${SETTINGS.apiSecret}`, http_code: 401, name: "Error" },
    { message: "Request Timeout", http_code: 499, name: "TimeoutError" },
    new Error(`boom ${SETTINGS.apiSecret} ${SETTINGS.apiKey}`),
    "a plain string",
    null,
    { http_code: "not a number" },
  ];
  for (const thrown of shapes) {
    const { client } = fakeClient({
      upload: async () => {
        throw thrown;
      },
    });
    const error = await rejection(new CloudinaryImageStore(SETTINGS, { client }).put("a/b.png", png(3), "image/png"));
    if ((thrown as { http_code?: unknown } | null)?.http_code === 401) expect(error.status).toBe(401);
    if ((thrown as { http_code?: unknown } | null)?.http_code === 499) expect(error.message).toMatch(/did not answer in time/);
  }
});

test("get: signs a 60-second download link for the key's format, fetches it, and returns the bytes with the content type OF THE KEY, not the far end's", async () => {
  const { client, calls } = fakeClient();
  const stored = png(1234);
  const seen: { url: URL; init?: RequestInit }[] = [];
  const store = new CloudinaryImageStore(SETTINGS, {
    client,
    now: () => NOW,
    fetch: fetchOf((url, init) => {
      seen.push({ url, init });
      return found(stored, { "content-type": "text/html", "content-length": String(stored.length) });
    }),
  });
  const got = await store.get("aleemaan/question-bank/img1.webp");
  expect(got).toEqual({ bytes: stored, contentType: "image/webp" });
  expect(calls.url).toEqual([
    {
      publicId: "aleemaan/question-bank/img1",
      format: "webp",
      options: expect.objectContaining({
        cloud_name: "school-demo",
        api_key: SETTINGS.apiKey,
        api_secret: SETTINGS.apiSecret,
        type: "authenticated",
        resource_type: "image",
        signature_algorithm: "sha256",
        timestamp: NOW_S,
        expires_at: NOW_S + 60,
      }),
    },
  ]);
  expect(seen).toHaveLength(1);
  expect(seen[0].url.host).toBe("api.cloudinary.com");
  expect(seen[0].init).toMatchObject({ method: "GET", redirect: "manual" });
  expect(seen[0].init?.signal).toBeInstanceOf(AbortSignal);
});

test("get: redirects are followed only to https Cloudinary hosts, at most three times; anything else is refused", async () => {
  const bytes = png(50);
  const route = async (first: Response, then?: (url: URL) => Response) => {
    const hops: string[] = [];
    const { client } = fakeClient();
    const store = new CloudinaryImageStore(SETTINGS, {
      client,
      fetch: fetchOf((url) => {
        hops.push(url.toString());
        return hops.length === 1 ? first : (then?.(url) ?? found(bytes));
      }),
    });
    return { store, hops };
  };

  // a redirect to the CDN host, with an absolute and with a relative address
  for (const to of ["https://res.cloudinary.com/school-demo/image/authenticated/x.png", "/other/path?x=1"]) {
    const { store, hops } = await route(redirect(to));
    expect(await store.get("a/b.png"), to).toMatchObject({ contentType: "image/png" });
    expect(hops).toHaveLength(2);
  }
  // refused: other hosts (including ones that merely CONTAIN the name), plain http, other schemes, no Location, an unusable Location
  for (const to of [
    "https://evil.example/x.png",
    "https://cloudinary.com.evil.example/x.png",
    "https://evilcloudinary.com/x.png",
    "https://res.cloudinary.com.evil.example/x.png",
    "http://res.cloudinary.com/x.png",
    "file:///etc/passwd",
    "data:image/png;base64,AAAA",
    "https://user:pass@evil.example/",
    "https://127.0.0.1/x.png",
  ]) {
    const { store, hops } = await route(redirect(to));
    await rejection(store.get("a/b.png"));
    expect(hops, `${to} must not be fetched`).toHaveLength(1);
  }
  const none = await route(new Response(null, { status: 302 }));
  await rejection(none.store.get("a/b.png"));
  const loop = await route(redirect("/again"), () => redirect("/again"));
  await rejection(loop.store.get("a/b.png"));
  expect(loop.hops).toHaveLength(4); // the first request and three redirects, then it gives up
  for (const status of [301, 303, 307, 308]) {
    const { store } = await route(redirect("https://res.cloudinary.com/x.png", status));
    expect(await store.get("a/b.png")).not.toBeNull();
  }
  // the signed link itself must be a Cloudinary host (a configured `upload_prefix` elsewhere must not redirect credentials)
  const { client } = fakeClient({ privateDownloadUrl: () => "https://evil.example/v1_1/x/image/download?signature=SECRETSIGNATURE" });
  let reached = false;
  const store = new CloudinaryImageStore(SETTINGS, {
    client,
    fetch: fetchOf(() => {
      reached = true;
      return found(bytes);
    }),
  });
  await rejection(store.get("a/b.png"));
  expect(reached).toBe(false);
});

test("get: 404 is 'no such object'; every other status, a network error and a timeout are StorageErrors that name no link, key or host", async () => {
  const make = (handler: Handler) => new CloudinaryImageStore(SETTINGS, { client: fakeClient().client, fetch: fetchOf(handler) });
  expect(await make(() => new Response("Resource not found", { status: 404 })).get("a/b.png")).toBeNull();
  for (const status of [400, 401, 403, 429, 500, 502, 503]) {
    const error = await rejection(make(() => new Response("secret body", { status })).get("a/b.png"));
    expect(error.status).toBe(status);
    expect(error.message).not.toContain("secret body");
  }
  const timeout = await rejection(
    make(() => {
      throw Object.assign(new Error(`timed out talking to https://api.cloudinary.com/?signature=SECRETSIGNATURE`), {
        name: "TimeoutError",
      });
    }).get("a/b.png"),
  );
  expect(timeout.message).toMatch(/did not answer in time/);
  const down = await rejection(
    make(() => {
      throw new TypeError("fetch failed: getaddrinfo ENOTFOUND api.cloudinary.com");
    }).get("a/b.png"),
  );
  expect(down.message).toMatch(/could not be reached/);
  // a package that cannot sign
  const broken = new CloudinaryImageStore(SETTINGS, {
    client: fakeClient({
      privateDownloadUrl: () => {
        throw new Error(`no api_secret ${SETTINGS.apiSecret}`);
      },
    }).client,
  });
  await rejection(broken.get("a/b.png"));
});

test("get: bounded reads. An object over maxBytes is refused by its declared length, and a stream with no length is cut off at maxBytes without being read to the end", async () => {
  const declared = new CloudinaryImageStore(SETTINGS, {
    client: fakeClient().client,
    fetch: fetchOf(() => found(png(5000), { "content-length": "5000" })),
  });
  await rejection(declared.get("a/b.png", 1000));
  expect((await declared.get("a/b.png", 5000))?.bytes.byteLength).toBe(5000);

  let pulled = 0;
  let cancelled = false;
  const endless = new CloudinaryImageStore(SETTINGS, {
    client: fakeClient().client,
    fetch: fetchOf(
      () =>
        new Response(
          new ReadableStream<Uint8Array>({
            pull(controller) {
              pulled++;
              if (pulled > 10_000) controller.close();
              else controller.enqueue(new Uint8Array(64 * 1024));
            },
            cancel() {
              cancelled = true;
            },
          }),
          { status: 200 },
        ),
    ),
  });
  await rejection(endless.get("a/b.png", 200 * 1024));
  expect(cancelled).toBe(true);
  expect(pulled).toBeLessThan(20); // a few chunks, not the 640 MB the stream offered
});

test("remove: the key's public id, authenticated, invalidating; 'ok' and 'not found' are both fine, anything else is not", async () => {
  const { client, calls } = fakeClient();
  const store = new CloudinaryImageStore(SETTINGS, { client });
  await store.remove("aleemaan/question-bank/img1.png");
  expect(calls.destroy).toHaveLength(1);
  expect(calls.destroy[0].publicId).toBe("aleemaan/question-bank/img1");
  expect(calls.destroy[0].options).toMatchObject({
    cloud_name: "school-demo",
    api_key: SETTINGS.apiKey,
    api_secret: SETTINGS.apiSecret,
    type: "authenticated",
    resource_type: "image",
    invalidate: true,
    signature_algorithm: "sha256",
  });
  for (const result of ["ok", "not found"]) {
    await new CloudinaryImageStore(SETTINGS, { client: fakeClient({ destroy: async () => ({ result }) }).client }).remove("a/b.png");
  }
  for (const odd of [{ result: "error" }, {}, null, undefined, "ok", { result: 1 }]) {
    await rejection(new CloudinaryImageStore(SETTINGS, { client: fakeClient({ destroy: async () => odd }).client }).remove("a/b.png"));
  }
  await rejection(
    new CloudinaryImageStore(SETTINGS, {
      client: fakeClient({
        destroy: async () => {
          throw { message: `bad ${SETTINGS.apiSecret}`, http_code: 500 };
        },
      }).client,
    }).remove("a/b.png"),
  );
  await expect(store.remove("not a key")).rejects.toThrow(InvalidStorageKeyError);
});

test("check: writes a real tiny image, reads it back, deletes it, and says why when any step fails", async () => {
  const objects = new Map<string, Uint8Array>();
  const client = fakeClient({
    upload: async (file, options) => {
      objects.set(String(options.public_id), Uint8Array.from(Buffer.from(file.split(",")[1], "base64")));
      return {};
    },
    destroy: async (publicId) => ({ result: objects.delete(publicId) ? "ok" : "not found" }),
    privateDownloadUrl: (publicId, format) =>
      `https://api.cloudinary.com/v1_1/school-demo/image/download?public_id=${encodeURIComponent(publicId)}&format=${format}`,
  }).client;
  const fetchStored = fetchOf((url) => {
    const bytes = objects.get(url.searchParams.get("public_id")!);
    return bytes ? found(bytes) : new Response("nope", { status: 404 });
  });
  expect(await new CloudinaryImageStore(SETTINGS, { client, fetch: fetchStored }).check()).toEqual({ ok: true });
  expect(objects.size).toBe(0); // the probe is gone

  const refused = await new CloudinaryImageStore(SETTINGS, {
    client: fakeClient({
      upload: async () => {
        throw { message: `no ${SETTINGS.apiSecret}`, http_code: 401 };
      },
    }).client,
  }).check();
  expect(refused.ok).toBe(false);
  expectNoLeak(refused);
  const truncated = await new CloudinaryImageStore(SETTINGS, { client, fetch: fetchOf(() => found(new Uint8Array(3))) }).check();
  expect(truncated).toMatchObject({ ok: false });
  const missing = await new CloudinaryImageStore(SETTINGS, { client, fetch: fetchOf(() => new Response("x", { status: 404 })) }).check();
  expect(missing).toMatchObject({ ok: false });
});

// ---- the vendor's package, for real ----

const signed256 = (params: Record<string, string>, secret: string) =>
  crypto
    .createHash("sha256")
    .update(
      Object.entries(params)
        .filter(([, v]) => v !== "")
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${v}`)
        .join("&") + secret,
    )
    .digest("hex");

test("the package signs the way Cloudinary documents: the two worked examples on Cloudinary's own page", async () => {
  const { v2 } = await import("cloudinary");
  // the package's type declaration lists two parameters; the function takes the algorithm as a third
  const sign = v2.utils.api_sign_request as (params: object, secret: string, algorithm?: string) => string;
  expect(sign({ timestamp: 1315060510 }, "abcd", "sha1")).toBe("a21ad0f63beb4de2e5575204b79ab90bffb02c10");
  expect(sign({ eager: "w_400,h_300,c_pad|w_260,h_200,c_crop", public_id: "sample_image", timestamp: 1315060510 }, "abcd", "sha1")).toBe(
    "bfd09f95f331f558cbd1320e67aa8d488770583e",
  );
});

test("the download link the package builds is an API-signed, time-limited request to Cloudinary's API host, and its SHA-256 signature recomputes independently", async () => {
  const { v2 } = await import("cloudinary");
  const link = new URL(
    v2.utils.private_download_url("aleemaan/question-bank/img1", "png", {
      cloud_name: SETTINGS.cloudName,
      api_key: SETTINGS.apiKey,
      api_secret: SETTINGS.apiSecret,
      type: "authenticated",
      resource_type: "image",
      timestamp: NOW_S,
      expires_at: NOW_S + 60,
      signature_algorithm: "sha256",
    } as never),
  );
  expect(link.origin).toBe("https://api.cloudinary.com");
  expect(link.pathname).toBe("/v1_1/school-demo/image/download");
  const q = Object.fromEntries(link.searchParams);
  expect(q).toMatchObject({
    public_id: "aleemaan/question-bank/img1",
    format: "png",
    type: "authenticated",
    timestamp: String(NOW_S),
    expires_at: String(NOW_S + 60),
    api_key: SETTINGS.apiKey,
  });
  const { signature, api_key: _apiKey, ...signedParams } = q;
  void _apiKey;
  expect(signature).toBe(signed256(signedParams, SETTINGS.apiSecret));
  expect(signature).toHaveLength(64);
  expect(link.toString()).not.toContain(SETTINGS.apiSecret);
});

test("through the real package: put and remove call its uploader with the adapter's options, and get fetches the link the package signed", async () => {
  const { v2 } = await import("cloudinary");
  const uploader = v2.uploader as unknown as { upload: unknown; destroy: unknown };
  const original = { upload: uploader.upload, destroy: uploader.destroy };
  const seen = { upload: [] as unknown[][], destroy: [] as unknown[][] };
  uploader.upload = async (...args: unknown[]) => {
    seen.upload.push(args);
    return { public_id: "x" };
  };
  uploader.destroy = async (...args: unknown[]) => {
    seen.destroy.push(args);
    return { result: "ok" };
  };
  try {
    const fetched: URL[] = [];
    const store = new CloudinaryImageStore(SETTINGS, {
      now: () => NOW,
      fetch: fetchOf((url) => {
        fetched.push(url);
        return found(png(40));
      }),
    });
    const bytes = png(300);
    await store.put("aleemaan/question-bank/img9.png", bytes, "image/png");
    expect(seen.upload).toHaveLength(1);
    const [file, options] = seen.upload[0] as [string, Record<string, unknown>];
    expect(Uint8Array.from(Buffer.from(file.split(",")[1], "base64"))).toEqual(bytes);
    expect(options).toMatchObject({
      public_id: "aleemaan/question-bank/img9",
      type: "authenticated",
      cloud_name: "school-demo",
      signature_algorithm: "sha256",
    });

    expect((await store.get("aleemaan/question-bank/img9.png"))?.bytes.byteLength).toBe(40);
    expect(fetched).toHaveLength(1);
    const q = Object.fromEntries(fetched[0].searchParams);
    expect(fetched[0].origin + fetched[0].pathname).toBe("https://api.cloudinary.com/v1_1/school-demo/image/download");
    const { signature, api_key: _apiKey, ...signedParams } = q;
    void _apiKey;
    expect(signature).toBe(signed256(signedParams, SETTINGS.apiSecret));
    expect(signedParams).toMatchObject({
      public_id: "aleemaan/question-bank/img9",
      format: "png",
      type: "authenticated",
      expires_at: String(NOW_S + 60),
    });

    await store.remove("aleemaan/question-bank/img9.png");
    expect(seen.destroy).toHaveLength(1);
    expect(seen.destroy[0][0]).toBe("aleemaan/question-bank/img9");
    expect(seen.destroy[0][1]).toMatchObject({ type: "authenticated", invalidate: true, api_key: SETTINGS.apiKey });
  } finally {
    uploader.upload = original.upload;
    uploader.destroy = original.destroy;
  }
});
