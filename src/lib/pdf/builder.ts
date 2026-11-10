// A small PDF 1.4 writer (task 0038): pages, text that can be measured and wrapped, lines and rectangles, three standard fonts, no dependency. It exists because the exam-paper writer
// (`question-bank/printing.ts`) cannot measure text and turns every letter outside ASCII into "?", which a pupil's name must not suffer. Pure: no clock, no I/O; the caller passes the date.
//
// Text is written in WinAnsi (Windows-1252), which holds the Western European letters. A letter outside it is written without its mark when it has a base letter that is in it (ọ as o, ẹ as e, ṣ as
// s), else as "?": Arabic, Chinese and the like cannot be shown with the standard fonts. `unsupported` tells the caller how many characters were lost, so a screen can say so.

export type FontKey = "regular" | "bold" | "mono";
export type Rgb = readonly [number, number, number];

const BASE_FONT: Record<FontKey, string> = { regular: "Helvetica", bold: "Helvetica-Bold", mono: "Courier" };
const RESOURCE: Record<FontKey, string> = { regular: "F1", bold: "F2", mono: "F3" };

// The standard Helvetica and Helvetica-Bold advance widths (thousandths of an em) for U+0020 to U+007E. Anything else is measured as the average letter (556), which errs on the safe side
// for accented capitals and is what a wrapped line is allowed to be wrong by (the layout keeps a margin for it).
// prettier-ignore
const HELVETICA = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
// prettier-ignore
const HELVETICA_BOLD = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];

export function charWidth(code: number, font: FontKey): number {
  if (font === "mono") return 600;
  if (code >= 32 && code <= 126) return (font === "bold" ? HELVETICA_BOLD : HELVETICA)[code - 32];
  return 556;
}

// The Windows-1252 code points of 0x80 to 0x9F (the rest of 0x80 to 0xFF is Latin-1).
const CP1252: Record<number, number> = {
  0x20ac: 0x80,
  0x201a: 0x82,
  0x0192: 0x83,
  0x201e: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x02c6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8a,
  0x2039: 0x8b,
  0x0152: 0x8c,
  0x017d: 0x8e,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x02dc: 0x98,
  0x2122: 0x99,
  0x0161: 0x9a,
  0x203a: 0x9b,
  0x0153: 0x9c,
  0x017e: 0x9e,
  0x0178: 0x9f,
};

/// One character as its WinAnsi byte, or null when it cannot be written (and has no base letter that can).
function winAnsi(ch: string): number | null {
  const cp = ch.codePointAt(0)!;
  if (cp === 0x09 || cp === 0x0a || cp === 0x0d) return 0x20;
  if (cp < 0x20 || cp === 0x7f) return null;
  if (cp < 0x80) return cp;
  if (cp >= 0xa0 && cp <= 0xff) return cp;
  if (CP1252[cp] !== undefined) return CP1252[cp];
  // A letter with a mark that WinAnsi lacks: its base letter (ọ -> o).
  const base = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (base !== ch && base.length >= 1) {
    const first = base.codePointAt(0)!;
    if (first < 0x80 && first >= 0x20) return first;
    if (first >= 0xa0 && first <= 0xff) return first;
  }
  return null;
}

export type Encoded = { bytes: number[]; unsupported: number };
export function encodeWinAnsi(text: string): Encoded {
  const bytes: number[] = [];
  let unsupported = 0;
  for (const ch of text) {
    // A mark on its own (the grave on a letter that was already reduced to its base) is dropped, not shown as a question mark.
    const cp = ch.codePointAt(0)!;
    if (cp >= 0x300 && cp <= 0x36f) continue;
    const byte = winAnsi(ch);
    if (byte === null) {
      bytes.push(0x3f);
      unsupported++;
    } else bytes.push(byte);
  }
  return { bytes, unsupported };
}

const hex = (bytes: number[]) => `<${bytes.map((b) => b.toString(16).padStart(2, "0")).join("")}>`;
const num = (n: number) => (Math.round(n * 100) / 100).toString();
const colour = (c: Rgb) => c.map((x) => num(x)).join(" ");

export type TextOptions = { font?: FontKey; size?: number; color?: Rgb; align?: "left" | "right" | "center" };

export class PdfBuilder {
  readonly pageWidth = 595.28;
  readonly pageHeight = 841.89;
  unsupported = 0;
  private pages: string[][] = [];
  private links: { page: number; rect: [number, number, number, number]; url: string }[] = [];
  private current = -1;

  constructor(private readonly info: { title: string; author: string; producer: string }) {}

  get pageCount(): number {
    return this.pages.length;
  }

  addPage(): number {
    this.pages.push([]);
    this.current = this.pages.length - 1;
    return this.current;
  }

  /// Draws on an earlier page again (for the footer, once the number of pages is known).
  selectPage(index: number): void {
    if (index < 0 || index >= this.pages.length) throw new Error("No such page.");
    this.current = index;
  }

  private ops(): string[] {
    if (this.current < 0) throw new Error("Add a page first.");
    return this.pages[this.current];
  }

  /// How wide a text is, in points, at a size.
  width(text: string, font: FontKey, size: number): number {
    let total = 0;
    for (const byte of encodeWinAnsi(text).bytes) total += charWidth(byte, font);
    return (total * size) / 1000;
  }

  /// Breaks a text into lines no wider than `maxWidth`: line ends in the text are kept, words are kept whole, and a word wider than a line is cut where it overflows.
  wrap(text: string, font: FontKey, size: number, maxWidth: number): string[] {
    const lines: string[] = [];
    for (const paragraph of text.replace(/\r\n?/g, "\n").split("\n")) {
      let line = "";
      for (const word of paragraph.split(/ +/).filter(Boolean)) {
        const attempt = line ? `${line} ${word}` : word;
        if (this.width(attempt, font, size) <= maxWidth) {
          line = attempt;
          continue;
        }
        if (line) lines.push(line);
        line = "";
        let rest = word;
        while (this.width(rest, font, size) > maxWidth && rest.length > 1) {
          let cut = rest.length - 1;
          while (cut > 1 && this.width(rest.slice(0, cut), font, size) > maxWidth) cut--;
          lines.push(rest.slice(0, cut));
          rest = rest.slice(cut);
        }
        line = rest;
      }
      lines.push(line);
    }
    return lines;
  }

  /// Text with its baseline at `y` (from the bottom of the page). For "right" and "center" `x` is the right edge and the middle.
  text(x: number, y: number, text: string, options: TextOptions = {}): void {
    const font = options.font ?? "regular";
    const size = options.size ?? 10;
    const encoded = encodeWinAnsi(text);
    this.unsupported += encoded.unsupported;
    if (encoded.bytes.length === 0) return;
    const w = this.width(text, font, size);
    const left = options.align === "right" ? x - w : options.align === "center" ? x - w / 2 : x;
    this.ops().push(
      `BT /${RESOURCE[font]} ${num(size)} Tf ${colour(options.color ?? [0, 0, 0])} rg ${num(left)} ${num(y)} Td ${hex(encoded.bytes)} Tj ET`,
    );
  }

  line(x1: number, y1: number, x2: number, y2: number, options: { width?: number; color?: Rgb } = {}): void {
    this.ops().push(
      `${num(options.width ?? 0.5)} w ${colour(options.color ?? [0.8, 0.8, 0.8])} RG ${num(x1)} ${num(y1)} m ${num(x2)} ${num(y2)} l S`,
    );
  }

  rect(x: number, y: number, w: number, h: number, options: { fill?: Rgb; stroke?: Rgb; lineWidth?: number } = {}): void {
    const parts: string[] = [];
    if (options.fill) parts.push(`${colour(options.fill)} rg`);
    if (options.stroke) parts.push(`${num(options.lineWidth ?? 0.5)} w ${colour(options.stroke)} RG`);
    parts.push(`${num(x)} ${num(y)} ${num(w)} ${num(h)} re ${options.fill && options.stroke ? "B" : options.fill ? "f" : "S"}`);
    this.ops().push(parts.join(" "));
  }

  /// Makes a rectangle of the current page a clickable link to `url` (an `http(s)` address of plain printable ASCII; anything else is left as plain text, so a
  /// malformed address can never produce a broken file). Returns whether the link was added.
  link(x: number, y: number, w: number, h: number, url: string): boolean {
    if (!/^https?:\/\/[\x21-\x7e]+$/.test(url)) return false;
    this.ops(); // a page must exist
    this.links.push({ page: this.current, rect: [x, y, x + w, y + h], url });
    return true;
  }

  /// The finished file. `date` goes into the document's creation date (the caller's clock, so the same input is the same file).
  build(date: Date): Buffer {
    if (this.pages.length === 0) this.addPage();
    const count = this.pages.length;
    const fontIds = { regular: 3 + count * 2, bold: 4 + count * 2, mono: 5 + count * 2 };
    const objects: string[] = [];
    objects.push("<< /Type /Catalog /Pages 2 0 R >>");
    objects.push(`<< /Type /Pages /Kids [${this.pages.map((_, i) => `${3 + i * 2} 0 R`).join(" ")}] /Count ${count} >>`);
    // The link annotations come after the document information, so every other object keeps its number.
    const firstAnnot = 7 + count * 2;
    this.pages.forEach((ops, i) => {
      const pageId = 3 + i * 2;
      const streamId = pageId + 1;
      const annots = this.links.flatMap((l, k) => (l.page === i ? [`${firstAnnot + k} 0 R`] : []));
      objects.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.pageWidth} ${this.pageHeight}] /Contents ${streamId} 0 R${annots.length ? ` /Annots [${annots.join(" ")}]` : ""} /Resources << /Font << /F1 ${fontIds.regular} 0 R /F2 ${fontIds.bold} 0 R /F3 ${fontIds.mono} 0 R >> >> >>`,
      );
      const content = ops.join("\n");
      objects.push(`<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`);
    });
    for (const key of ["regular", "bold", "mono"] as const)
      objects.push(`<< /Type /Font /Subtype /Type1 /BaseFont /${BASE_FONT[key]} /Encoding /WinAnsiEncoding >>`);
    const stamp = `D:${date.toISOString().replace(/[-:T]/g, "").slice(0, 14)}Z`;
    objects.push(
      `<< /Title ${hex(encodeWinAnsi(this.info.title).bytes)} /Author ${hex(encodeWinAnsi(this.info.author).bytes)} /Producer ${hex(encodeWinAnsi(this.info.producer).bytes)} /CreationDate (${stamp}) >>`,
    );

    const infoId = objects.length;
    for (const l of this.links) {
      const url = l.url.replace(/([\\()])/g, "\\$1");
      objects.push(`<< /Type /Annot /Subtype /Link /Rect [${l.rect.map(num).join(" ")}] /Border [0 0 0] /A << /S /URI /URI (${url}) >> >>`);
    }

    const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "latin1")];
    const offsets: number[] = [];
    let length = chunks[0].length;
    objects.forEach((body, i) => {
      offsets.push(length);
      const chunk = Buffer.from(`${i + 1} 0 obj\n${body}\nendobj\n`, "latin1");
      chunks.push(chunk);
      length += chunk.length;
    });
    const xref = [
      `xref\n0 ${objects.length + 1}\n`,
      "0000000000 65535 f \n",
      ...offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`),
    ].join("");
    const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${length}\n%%EOF\n`;
    chunks.push(Buffer.from(xref + trailer, "latin1"));
    return Buffer.concat(chunks);
  }
}
