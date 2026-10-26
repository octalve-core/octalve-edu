import sharp, { type Metadata } from "sharp";

// What happens to a question image between the upload and the storage backend. Nothing the person sent is stored: the picture is decoded and drawn again, so only its pixels
// survive. In order:
//
//   1. size: an upload over 8 MB is refused before anything reads it;
//   2. type, by CONTENT: the first bytes must be a JPEG, a PNG or a WebP. A name, a Content-Type header or a form field means nothing, and anything else (an SVG, an HTML page,
//      a GIF, a PDF, a TIFF, an AVIF, a zip) never reaches the image library, so none of its parsers runs on hostile input;
//   3. pixels, BEFORE decoding: the header says how large the picture is, and more than 40 megapixels is refused unread. (A decompression bomb is a small file that claims or
//      inflates to gigabytes; the claim is read from the header, and the library is also told the limit.)
//   4. animation: a still picture only;
//   5. re-encoding: orientation applied to the pixels, converted to sRGB, drawn at no more than `maxLongSide` on its long side (never enlarged), written in the SAME kind, with
//      no metadata at all (no GPS position, camera or software tags, copyright, text chunks, ICC profile) and nothing after the image data. If it is bigger than `maxBytes` it is
//      tried again at lower quality and then smaller, a bounded number of times, and refused if it still does not fit.
//
// Every refusal is an `ImageRejectedError` with a fixed reason and a fixed sentence that can be shown to the person: it never repeats the file's bytes or the library's text.

export const IMAGE_INPUT_MAX_BYTES = 8 * 1024 * 1024;
export const IMAGE_INPUT_MAX_PIXELS = 40_000_000;

export type ImageLimits = { maxBytes: number; maxLongSide: number };
export type ImageKind = "jpeg" | "png" | "webp";
export type ProcessedImage = {
  bytes: Uint8Array;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  extension: "jpg" | "png" | "webp";
  width: number;
  height: number;
};

export type ImageRejection =
  "EMPTY" | "TOO_BIG_UPLOAD" | "NOT_AN_IMAGE" | "UNREADABLE" | "ANIMATED" | "TOO_MANY_PIXELS" | "TOO_LARGE_AFTER_COMPRESSION";

const SENTENCES: Record<ImageRejection, string> = {
  EMPTY: "The file is empty.",
  TOO_BIG_UPLOAD: "That file is too large. Use a picture under 8 MB.",
  NOT_AN_IMAGE: "Use a JPEG, PNG or WebP picture.",
  UNREADABLE: "That picture could not be read. It may be damaged: save it again and try once more.",
  ANIMATED: "Use a still picture, not an animation.",
  TOO_MANY_PIXELS: "That picture has too many pixels. Reduce it to 40 megapixels or fewer (for example 8000 by 5000).",
  TOO_LARGE_AFTER_COMPRESSION:
    "That picture is too detailed to fit the size limit even after it is shrunk. Crop it or reduce it and try again.",
};

export class ImageRejectedError extends Error {
  readonly reason: ImageRejection;
  constructor(reason: ImageRejection) {
    super(SENTENCES[reason]);
    this.name = "ImageRejectedError";
    this.reason = reason;
  }
}

// libvips keeps a cache of decoded pictures between calls: on a serverless host that is memory held for nothing.
sharp.cache(false);

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const ascii = (bytes: Uint8Array, from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));

/// The kind of picture the first bytes say this is, or null. Content only.
export function sniffImageKind(bytes: Uint8Array): ImageKind | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 8 && PNG_SIGNATURE.every((b, i) => bytes[i] === b)) return "png";
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return "webp";
  return null;
}

const OUTPUT: Record<ImageKind, Pick<ProcessedImage, "contentType" | "extension">> = {
  jpeg: { contentType: "image/jpeg", extension: "jpg" },
  png: { contentType: "image/png", extension: "png" },
  webp: { contentType: "image/webp", extension: "webp" },
};

// The most that is tried to fit a picture into `maxBytes`: three sizes, and at each of them a lossy quality ladder (a PNG: lossless, then a reduced palette). At most 9 encodes.
const SCALES = [1, 0.75, 0.55] as const;
const LOSSY_QUALITIES = [80, 65, 50] as const;

// `failOn: "truncated"`: a cut-off file is refused, but a picture with a harmless quirk (the stray bytes some phones and editors leave in a JPEG) is not: the library's default of
// failing on any warning would send teachers away with a photo that is fine. Whatever is accepted is decoded and drawn again, so a quirk never reaches the result.
const OPEN = { limitInputPixels: IMAGE_INPUT_MAX_PIXELS, failOn: "truncated" } as const;

function encode(source: Buffer, kind: ImageKind, side: number, attempt: number) {
  const drawn = sharp(source, OPEN)
    .rotate() // apply the EXIF orientation to the pixels (the tag itself is not written back)
    .resize({ width: side, height: side, fit: "inside", withoutEnlargement: true })
    .toColourspace("srgb");
  if (kind === "jpeg") return drawn.jpeg({ quality: LOSSY_QUALITIES[attempt] ?? 50, chromaSubsampling: "4:2:0", progressive: true });
  if (kind === "webp") return drawn.webp({ quality: LOSSY_QUALITIES[attempt] ?? 50 });
  return attempt === 0
    ? drawn.png({ compressionLevel: 9, adaptiveFiltering: true })
    : drawn.png({ compressionLevel: 9, palette: true, quality: 80, effort: 6 });
}

export async function processQuestionImage(input: Uint8Array, limits: ImageLimits): Promise<ProcessedImage> {
  if (input.byteLength === 0) throw new ImageRejectedError("EMPTY");
  if (input.byteLength > IMAGE_INPUT_MAX_BYTES) throw new ImageRejectedError("TOO_BIG_UPLOAD");
  const kind = sniffImageKind(input);
  if (!kind) throw new ImageRejectedError("NOT_AN_IMAGE");
  const source = Buffer.from(input.buffer, input.byteOffset, input.byteLength);

  let meta: Metadata;
  try {
    meta = await sharp(source, OPEN).metadata();
  } catch (error) {
    // the library refuses to read the header of a picture over the limit it was given
    throw new ImageRejectedError(/pixel limit/i.test(String((error as Error)?.message)) ? "TOO_MANY_PIXELS" : "UNREADABLE");
  }
  if (meta.format !== kind || !meta.width || !meta.height) throw new ImageRejectedError("UNREADABLE");
  if (meta.width * meta.height > IMAGE_INPUT_MAX_PIXELS) throw new ImageRejectedError("TOO_MANY_PIXELS");
  if ((meta.pages ?? 1) > 1) throw new ImageRejectedError("ANIMATED");

  const attempts = kind === "png" ? 2 : LOSSY_QUALITIES.length;
  try {
    for (const scale of SCALES) {
      const side = Math.max(16, Math.floor(limits.maxLongSide * scale));
      for (let attempt = 0; attempt < attempts; attempt++) {
        const { data, info } = await encode(source, kind, side, attempt).toBuffer({ resolveWithObject: true });
        if (data.byteLength <= limits.maxBytes) {
          return {
            bytes: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
            ...OUTPUT[kind],
            width: info.width,
            height: info.height,
          };
        }
      }
    }
  } catch (error) {
    if (error instanceof ImageRejectedError) throw error;
    throw new ImageRejectedError(/pixel limit/i.test(String((error as Error)?.message)) ? "TOO_MANY_PIXELS" : "UNREADABLE");
  }
  throw new ImageRejectedError("TOO_LARGE_AFTER_COMPRESSION");
}
