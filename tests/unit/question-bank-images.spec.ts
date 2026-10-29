import "../support/env";
import zlib from "node:zlib";
import sharp from "sharp";
import { test, expect } from "@playwright/test";
import {
  IMAGE_INPUT_MAX_BYTES,
  IMAGE_INPUT_MAX_PIXELS,
  ImageRejectedError,
  processQuestionImage,
  type ImageRejection,
} from "@/lib/question-bank/images";

// A question image is decoded and re-encoded on OUR server before any storage backend sees it. These tests use real image files (made with sharp itself, or built byte by byte)
// because the guarantees are about bytes: the type is decided by CONTENT, a decompression bomb is refused BEFORE it is decoded, nothing survives from the upload but the pixels
// (no GPS position, no camera or software tags, no text chunks, no trailing data), orientation is applied, and the result is bounded in size and dimensions.

const LIMITS = { maxBytes: 500 * 1024, maxLongSide: 1600 };
const MARKER = "SECRET-MARKER-9f3a";

const solid = (width: number, height: number, background = "#3366aa") => sharp({ create: { width, height, channels: 3, background } });
/// A picture with some texture, so JPEG and WebP have something to compress and a real photo-like size.
async function textured(width: number, height: number): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 3);
  let s = 12345;
  for (let i = 0; i < raw.length; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    raw[i] = ((i / 3) % width) / 4 + ((s >> 16) & 31);
  }
  return sharp(raw, { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer();
}
const GPS_AND_TAGS = {
  IFD0: { Copyright: MARKER, Software: `${MARKER}-software`, Artist: `${MARKER}-artist` },
  IFD3: { GPSLatitudeRef: "N", GPSLatitude: "51/1 30/1 0/1", GPSLongitudeRef: "W", GPSLongitude: "0/1 7/1 0/1" },
};
const jpegWithGps = async (width = 64, height = 48) => solid(width, height).jpeg().withExif(GPS_AND_TAGS).toBuffer();
const contains = (haystack: Uint8Array, needle: string) => Buffer.from(haystack).includes(Buffer.from(needle, "latin1"));

async function reasonOf(promise: Promise<unknown>): Promise<ImageRejection> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ImageRejectedError);
    return (error as ImageRejectedError).reason;
  }
  throw new Error("expected the image to be refused");
}

const crc32 = (buf: Buffer) => {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
};
const pngChunk = (type: string, data: Buffer) => {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "latin1"), data])), 0);
  return Buffer.concat([head, data, crc]);
};
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/// A PNG whose header CLAIMS this size and whose data is a few bytes: what a decompression bomb looks like before it is inflated.
function pngClaiming(width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(Buffer.alloc(64))),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}
/// A valid PNG with a text chunk (the kind of place a tool leaves a name or a comment) inserted before its end.
function withTextChunk(png: Buffer, text: string): Buffer {
  const iend = png.length - 12; // IEND is 12 bytes: length, type, crc
  return Buffer.concat([png.subarray(0, iend), pngChunk("tEXt", Buffer.from(`Comment\0${text}`, "latin1")), png.subarray(iend)]);
}

test("the limits are what the design says: an upload over 8 MB is refused before anything reads it, and 40 megapixels is the most that is ever decoded", () => {
  expect(IMAGE_INPUT_MAX_BYTES).toBe(8 * 1024 * 1024);
  expect(IMAGE_INPUT_MAX_PIXELS).toBe(40_000_000);
});

test("a JPEG, a PNG and a WebP are accepted and come back as the SAME kind, re-encoded, with the right content type and extension", async () => {
  for (const [kind, make, contentType, extension] of [
    ["jpeg", () => solid(120, 80).jpeg().toBuffer(), "image/jpeg", "jpg"],
    ["png", () => solid(120, 80).png().toBuffer(), "image/png", "png"],
    ["webp", () => solid(120, 80).webp().toBuffer(), "image/webp", "webp"],
  ] as const) {
    const out = await processQuestionImage(await make(), LIMITS);
    expect(out.contentType, kind).toBe(contentType);
    expect(out.extension, kind).toBe(extension);
    expect({ w: out.width, h: out.height }, kind).toEqual({ w: 120, h: 80 });
    const meta = await sharp(Buffer.from(out.bytes)).metadata();
    expect(meta.format, kind).toBe(kind);
    expect({ w: meta.width, h: meta.height }, kind).toEqual({ w: 120, h: 80 });
  }
});

test("everything the upload carried besides pixels is gone: GPS position, camera and software tags, copyright, PNG text chunks, an ICC profile, and bytes after the image", async () => {
  // JPEG with EXIF: the position and the tags are in the upload and not in the result
  const withGps = await jpegWithGps();
  expect((await sharp(withGps).metadata()).exif, "the test image really carries EXIF").toBeDefined();
  expect(contains(withGps, MARKER), "and the marker is really in the upload").toBe(true);
  const jpeg = await processQuestionImage(withGps, LIMITS);
  expect(contains(jpeg.bytes, MARKER)).toBe(false);
  expect(contains(jpeg.bytes, "Exif")).toBe(false);
  expect((await sharp(Buffer.from(jpeg.bytes)).metadata()).exif).toBeUndefined();

  // PNG with a text chunk
  const withText = withTextChunk(await solid(40, 30).png().toBuffer(), MARKER);
  expect(contains(withText, MARKER)).toBe(true);
  const png = await processQuestionImage(withText, LIMITS);
  expect(contains(png.bytes, MARKER)).toBe(false);
  expect(contains(png.bytes, "tEXt")).toBe(false);

  // WebP with EXIF
  const webpIn = await solid(40, 30).webp().withExif(GPS_AND_TAGS).toBuffer();
  expect(contains(webpIn, MARKER)).toBe(true);
  const webp = await processQuestionImage(webpIn, LIMITS);
  expect(contains(webp.bytes, MARKER)).toBe(false);
  expect((await sharp(Buffer.from(webp.bytes)).metadata()).exif).toBeUndefined();

  // an ICC profile does not survive either (the pixels are converted to sRGB)
  const icc = await solid(40, 30).jpeg().withIccProfile("p3").toBuffer();
  expect((await sharp(icc).metadata()).icc, "the test image really carries a profile").toBeDefined();
  expect((await sharp(Buffer.from((await processQuestionImage(icc, LIMITS)).bytes)).metadata()).icc).toBeUndefined();

  // a polyglot: a valid image with a script, an HTML page and a zip header appended
  const base = await solid(40, 30).png().toBuffer();
  const polyglot = Buffer.concat([base, Buffer.from(`<script>alert("${MARKER}")</script><html>PK\u0003\u0004`, "latin1")]);
  const out = await processQuestionImage(polyglot, LIMITS);
  expect(contains(out.bytes, "<script")).toBe(false);
  expect(contains(out.bytes, MARKER)).toBe(false);
  expect(Buffer.from(out.bytes).subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
});

test("the EXIF orientation is applied to the pixels and then dropped: a photo taken on its side comes out upright", async () => {
  const rotated = await solid(60, 30).jpeg().withMetadata({ orientation: 6 }).toBuffer(); // stored 60x30, to be shown 30x60
  expect((await sharp(rotated).metadata()).orientation).toBe(6);
  const out = await processQuestionImage(rotated, LIMITS);
  expect({ w: out.width, h: out.height }).toEqual({ w: 30, h: 60 });
  const meta = await sharp(Buffer.from(out.bytes)).metadata();
  expect({ w: meta.width, h: meta.height, orientation: meta.orientation }).toEqual({ w: 30, h: 60, orientation: undefined });
});

test("the long side is bounded by the setting and nothing is enlarged; the result is within the byte setting", async () => {
  const big = await sharp(await textured(2400, 1800))
    .jpeg({ quality: 95 })
    .toBuffer();
  const out = await processQuestionImage(big, { maxBytes: 300 * 1024, maxLongSide: 1000 });
  expect(Math.max(out.width, out.height)).toBe(1000);
  expect(out.width / out.height).toBeCloseTo(2400 / 1800, 1);
  expect(out.bytes.byteLength).toBeLessThanOrEqual(300 * 1024);

  const small = await processQuestionImage(await solid(100, 50).png().toBuffer(), { maxBytes: 300 * 1024, maxLongSide: 1000 });
  expect({ w: small.width, h: small.height }).toEqual({ w: 100, h: 50 }); // not enlarged

  // a tall picture is bounded on its long side, which is the height
  const tall = await processQuestionImage(
    await sharp(await textured(900, 2700))
      .jpeg()
      .toBuffer(),
    { maxBytes: 400 * 1024, maxLongSide: 900 },
  );
  expect(tall.height).toBe(900);
  expect(tall.width).toBe(300);
});

test("a picture that cannot be made small enough is refused with a clear reason, not stored large", async () => {
  // noise does not compress: with a tiny byte budget even the smallest allowed encoding is too big
  const noise = Buffer.alloc(400 * 400 * 3);
  for (let i = 0; i < noise.length; i++) noise[i] = (i * 2654435761) >>> 24;
  const input = await sharp(noise, { raw: { width: 400, height: 400, channels: 3 } })
    .png()
    .toBuffer();
  expect(await reasonOf(processQuestionImage(input, { maxBytes: 2 * 1024, maxLongSide: 1600 }))).toBe("TOO_LARGE_AFTER_COMPRESSION");
});

test("the type is decided by CONTENT: a name, a header or a PNG saying it is a JPEG means nothing; what is not a JPEG, PNG or WebP is refused whatever it claims", async () => {
  const png = await solid(30, 30).png().toBuffer();
  // (the function never sees a file name or a Content-Type: a PNG "renamed .jpg" is simply a PNG and comes back as one)
  expect((await processQuestionImage(png, LIMITS)).contentType).toBe("image/png");

  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script><rect width="10" height="10"/></svg>`,
  );
  const html = Buffer.from(`<!doctype html><html><body><script>alert(1)</script></body></html>`);
  const gif = Buffer.from("GIF89a\u0001\u0000\u0001\u0000\u0000\u0000\u0000;", "latin1");
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
  const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
  const tiff = await solid(8, 8).tiff().toBuffer();
  const avif = await solid(8, 8).avif().toBuffer();
  const gifReal = await solid(8, 8).gif().toBuffer();
  for (const [label, bytes] of [
    ["svg", svg],
    ["html", html],
    ["gif header", gif],
    ["a real gif", gifReal],
    ["pdf", pdf],
    ["zip", zip],
    ["tiff", tiff],
    ["avif", avif],
    ["text", Buffer.from("hello, this is not an image")],
    ["one byte", Buffer.from([0xff])],
  ] as const) {
    expect(await reasonOf(processQuestionImage(bytes, LIMITS)), label).toBe("NOT_AN_IMAGE");
  }
  expect(await reasonOf(processQuestionImage(new Uint8Array(0), LIMITS))).toBe("EMPTY");
});

test("an image header followed by something else is refused (the content, not the first bytes, decides)", async () => {
  const lies: [string, Buffer][] = [
    ["PNG signature then HTML", Buffer.concat([PNG_SIGNATURE, Buffer.from("<html><script>alert(1)</script></html>")])],
    [
      "JPEG marker then HTML",
      Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("<html><script>alert(1)</script></html>")]),
    ],
    ["RIFF/WEBP then HTML", Buffer.concat([Buffer.from("RIFF\u0010\u0000\u0000\u0000WEBP", "latin1"), Buffer.from("<html></html>")])],
    ["PNG signature only", PNG_SIGNATURE],
    ["PNG signature then zeros", Buffer.concat([PNG_SIGNATURE, Buffer.alloc(200)])],
  ];
  for (const [label, bytes] of lies) {
    const reason = await reasonOf(processQuestionImage(bytes, LIMITS));
    expect(["NOT_AN_IMAGE", "UNREADABLE"], label).toContain(reason);
  }
});

test("a truncated or corrupted image is refused, never half-decoded", async () => {
  const jpeg = await sharp(await textured(300, 200))
    .jpeg()
    .toBuffer();
  const png = await textured(300, 200);
  const webp = await sharp(await textured(300, 200))
    .webp()
    .toBuffer();
  for (const [label, whole] of [
    ["jpeg", jpeg],
    ["png", png],
    ["webp", webp],
  ] as const) {
    for (const keep of [0.2, 0.5, 0.9]) {
      const cut = whole.subarray(0, Math.floor(whole.length * keep));
      expect(["UNREADABLE", "NOT_AN_IMAGE"], `${label} cut at ${keep}`).toContain(await reasonOf(processQuestionImage(cut, LIMITS)));
    }
  }
});

test("a decompression bomb is refused BEFORE it is inflated: a header that claims billions of pixels, and a real picture over the pixel limit", async () => {
  const started = Date.now();
  expect(await reasonOf(processQuestionImage(pngClaiming(60_000, 60_000), LIMITS))).toBe("TOO_MANY_PIXELS");
  expect(await reasonOf(processQuestionImage(pngClaiming(65_535, 65_535), LIMITS))).toBe("TOO_MANY_PIXELS");
  // 8000 x 6000 = 48 megapixels of one colour: tiny as a file, 192 MB if decoded
  const flat = await solid(8000, 6000).png().toBuffer();
  expect(flat.length, "a small file for a picture that is 192 MB decoded").toBeLessThan(2_000_000);
  expect(await reasonOf(processQuestionImage(flat, LIMITS))).toBe("TOO_MANY_PIXELS");
  // at the limit is fine; one row over is not
  const atLimit = await solid(8000, 5000).png().toBuffer(); // exactly 40,000,000
  expect((await processQuestionImage(atLimit, LIMITS)).width).toBeLessThanOrEqual(1600);
  expect(await reasonOf(processQuestionImage(await solid(8000, 5001).png().toBuffer(), LIMITS))).toBe("TOO_MANY_PIXELS");
  expect(Date.now() - started, "refusing a bomb is quick").toBeLessThan(20_000);
});

test("an upload over the size cap is refused before anything reads it", async () => {
  const huge = Buffer.alloc(IMAGE_INPUT_MAX_BYTES + 1);
  PNG_SIGNATURE.copy(huge);
  expect(await reasonOf(processQuestionImage(huge, LIMITS))).toBe("TOO_BIG_UPLOAD");
});

test("an animated image is refused (a question image is a still picture)", async () => {
  // two frames joined into one animated WebP
  const frame = (background: string) => solid(40, 40, background).png().toBuffer();
  const animated = await sharp([await frame("#cc0000"), await frame("#0000cc")], { join: { animated: true, across: 1 } })
    .webp({ loop: 0, delay: [100, 100] })
    .toBuffer();
  expect((await sharp(animated).metadata()).pages, "the test image really is animated").toBe(2);
  expect(await reasonOf(processQuestionImage(animated, LIMITS))).toBe("ANIMATED");
});

test("fuzz: random damage to valid pictures is either accepted as a clean image or refused with a reason; nothing else is ever thrown and nothing hangs", async () => {
  let seed = 4242;
  const next = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const bases = [
    await sharp(await textured(48, 32))
      .jpeg()
      .toBuffer(),
    await textured(48, 32),
    await sharp(await textured(48, 32))
      .webp()
      .toBuffer(),
  ];
  const outcomes = { accepted: 0, refused: 0 };
  const problems: string[] = [];
  for (let i = 0; i < 400; i++) {
    const bytes = Buffer.from(bases[i % bases.length]);
    for (let m = 1 + Math.floor(next() * 4); m > 0; m--) {
      const at = Math.floor(next() * bytes.length);
      const kind = next();
      if (kind < 0.6) bytes[at] = Math.floor(next() * 256);
      else if (kind < 0.8) bytes.fill(0, at, Math.min(bytes.length, at + 1 + Math.floor(next() * 12)));
      else bytes.fill(0xff, at, Math.min(bytes.length, at + 1 + Math.floor(next() * 12)));
    }
    const input = next() < 0.15 ? bytes.subarray(0, Math.floor(next() * bytes.length)) : bytes;
    try {
      const out = await processQuestionImage(input, LIMITS);
      outcomes.accepted++;
      // whatever was accepted is a clean, bounded picture of a known kind
      const meta = await sharp(Buffer.from(out.bytes)).metadata();
      if (!["jpeg", "png", "webp"].includes(meta.format ?? "")) problems.push(`case ${i}: accepted but is ${meta.format}`);
      if (meta.exif) problems.push(`case ${i}: accepted with EXIF`);
      if (Math.max(out.width, out.height) > LIMITS.maxLongSide) problems.push(`case ${i}: too big`);
    } catch (error) {
      if (error instanceof ImageRejectedError) outcomes.refused++;
      else problems.push(`case ${i}: threw ${String(error).slice(0, 80)}`);
    }
  }
  expect(problems).toEqual([]);
  expect(outcomes.accepted, "some damage is harmless").toBeGreaterThan(20);
  expect(outcomes.refused, "some damage is fatal").toBeGreaterThan(20);
});

test("a refusal never repeats the file's bytes or a decoder's text: only a fixed reason and a fixed sentence", async () => {
  for (const input of [
    Buffer.from(`<svg onload="alert('${MARKER}')">`),
    Buffer.concat([PNG_SIGNATURE, Buffer.from(MARKER)]),
    pngClaiming(70_000, 70_000),
  ]) {
    try {
      await processQuestionImage(input, LIMITS);
      throw new Error("expected a refusal");
    } catch (error) {
      expect(error).toBeInstanceOf(ImageRejectedError);
      const text = `${(error as Error).message} ${JSON.stringify(error)}`;
      expect(text).not.toContain(MARKER);
      expect(text).not.toMatch(/vips|libvips|sharp|\/home\/|node_modules/i);
    }
  }
});
