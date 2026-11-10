// A piece of a download's file name (tasks 0038 and 0039): letters and digits, anything else one dash, at most 50 characters, so a name or a label can never put a path, a quote or a line break
// into a `Content-Disposition` header. Letters with marks become their base letters first (an accent is not a reason to lose the letter).
export const fileNamePart = (text: string, fallback: string): string =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || fallback;
