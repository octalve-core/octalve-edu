import { cleanText } from "@/lib/question-bank/item-input";

// What a teacher may send with a question picture (task 0024 slice D), no database: one `file`, an `alt` description and whether the picture is `decorative`. Nothing else is
// accepted, so a field that means something later cannot be slipped in now. The picture itself is judged by `processQuestionImage` (images.ts), not here.

export const ALT_MAX = 300;
const FIELDS = new Set(["file", "alt", "decorative"]);

export type ImageUpload = { bytes: Uint8Array; alt: string; decorative: boolean };
export type ImageUploadParsed = { ok: true; upload: ImageUpload } | { ok: false; message: string };

export async function parseImageForm(form: FormData): Promise<ImageUploadParsed> {
  for (const key of form.keys())
    if (!FIELDS.has(key)) return { ok: false, message: `The field "${key.slice(0, 40).replace(/[^\w .-]/g, "?")}" is not accepted.` };

  const files = form.getAll("file");
  if (files.length !== 1 || typeof files[0] === "string") return { ok: false, message: 'Send exactly one picture in the field "file".' };
  const alts = form.getAll("alt");
  const flags = form.getAll("decorative");
  if (alts.length > 1 || flags.length > 1 || alts.some((v) => typeof v !== "string") || flags.some((v) => typeof v !== "string")) {
    return { ok: false, message: "Send the description and the decorative flag as plain text, once each." };
  }
  const flag = flags[0] as string | undefined;
  if (flag !== undefined && flag !== "true" && flag !== "false") return { ok: false, message: "Decorative must be true or false." };
  const decorative = flag === "true";

  const rawAlt = (alts[0] as string | undefined) ?? "";
  if (rawAlt.length > ALT_MAX * 4) return { ok: false, message: `The description can be at most ${ALT_MAX} characters.` };
  const alt = cleanText(rawAlt, { multiline: false });
  if (alt === null) return { ok: false, message: "The description contains a character that cannot be used." };
  if (alt.length > ALT_MAX) return { ok: false, message: `The description can be at most ${ALT_MAX} characters.` };
  if (decorative && alt !== "")
    return { ok: false, message: "A decorative picture has no description. Clear it, or say the picture is not decorative." };
  if (!decorative && alt === "")
    return { ok: false, message: "Describe the picture for someone who cannot see it, or say it is decorative." };

  const blob = files[0] as Blob;
  return { ok: true, upload: { bytes: new Uint8Array(await blob.arrayBuffer()), alt, decorative } };
}
