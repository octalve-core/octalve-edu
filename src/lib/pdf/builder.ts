// A small PDF 1.4 writer (task 0038): pages, text that can be measured and wrapped, lines and rectangles, three standard fonts, no dependency. It exists because the exam-paper writer
// (`question-bank/printing.ts`) cannot measure text and turns every letter outside ASCII into "?", which a pupil's name must not suffer. Pure: no clock, no I/O; the caller passes the date.
//
// Text is written in WinAnsi (Windows-1252), which holds the Western European letters, and drawn with the standard fonts. A text that WinAnsi cannot write exactly (a Yoruba tone mark, Arabic,
// Cyrillic...) is drawn instead with embedded Noto fonts (task 0045: Noto Sans, Noto Naskh Arabic; shaped and put in bidirectional order by unicode-text.ts and unicode-fonts.ts, and cut down
// to the glyphs the document uses), so a document whose words are all WinAnsi is byte for byte what it was. A character no embedded font has is drawn as "?"; `unsupported` tells the caller how
// many characters were lost, so a screen can say so.
//
// `encodeWinAnsi` still reduces a letter to its base letter (ọ as o) when it is called directly; the builder no longer sends it anything it would reduce.
import { deflateSync } from "node:zlib";
import { clusters, utf16Hex, visualRuns, type Script } from "./unicode-text";
import { UNI_KEYS, loadUnicodeFonts, type FontSubset, type LaidGlyph, type UniFontKey, type UnicodeFontSet } from "./unicode-fonts";

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

/// True when WinAnsi cannot write this text exactly, so it must be drawn with the embedded fonts. Control characters do not count (they stay what they were: a "?" that is counted).
export function needsUnicode(text: string): boolean {
  for (const ch of text.normalize("NFC")) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x20 || (cp >= 0x7f && cp <= 0x9f && CP1252[cp] === undefined)) continue;
    if (cp < 0x80 || (cp >= 0xa0 && cp <= 0xff) || CP1252[cp] !== undefined) continue;
    return true;
  }
  return false;
}

const uniKey = (script: Script, bold: boolean): UniFontKey =>
  script === "sans" ? (bold ? "sansBold" : "sans") : bold ? "naskhBold" : "naskh";
/// The name an embedded font has in the page's resources (U1 to U4: the keys in order).
const resourceOf = (key: UniFontKey) => `U${UNI_KEYS.indexOf(key) + 1}`;
const SUBSET_TAG: Record<UniFontKey, string> = { sans: "AAAAAA", sansBold: "AAAAAB", naskh: "AAAAAC", naskhBold: "AAAAAD" };

/// A text laid out for drawing with the embedded fonts: pieces in the order they stand on the line, each in one font, with the width in thousandths of an em.
type Laid = { pieces: { key: UniFontKey; glyphs: LaidGlyph[] }[]; width: number; unsupported: number; rtl: boolean };
type Used = { subset: FontSubset; toUnicode: Map<number, number[]>; widths: Map<number, number> };

/// A string of the document information: WinAnsi bytes when they say it exactly, else UTF-16BE with a byte-order mark (the form a PDF uses for text outside its own encoding), so a tab or a
/// file list shows a pupil's name as it is written.
const infoString = (text: string): string => {
  const t = text.normalize("NFC");
  return needsUnicode(t) ? `<FEFF${utf16Hex(t)}>` : hex(encodeWinAnsi(t).bytes);
};

const hex = (bytes: number[]) => `<${bytes.map((b) => b.toString(16).padStart(2, "0")).join("")}>`;
const num = (n: number) => (Math.round(n * 100) / 100).toString();
const colour = (c: Rgb) => c.map((x) => num(x)).join(" ");

/// The ToUnicode CMap of an embedded font: for each glyph the Unicode text it stands for, so the text can be copied and searched (a ligature stands for several characters).
function toUnicodeCMap(map: Map<number, number[]>): string {
  const entries = [...map].sort((a, b) => a[0] - b[0]);
  const blocks: string[] = [];
  for (let i = 0; i < entries.length; i += 100) {
    const chunk = entries.slice(i, i + 100);
    blocks.push(
      `${chunk.length} beginbfchar\n${chunk.map(([gid, cps]) => `<${gid.toString(16).padStart(4, "0")}> <${utf16Hex(String.fromCodePoint(...cps))}>`).join("\n")}\nendbfchar`,
    );
  }
  return [
    "/CIDInit /ProcSet findresource begin",
    "12 dict begin",
    "begincmap",
    "/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def",
    "/CMapName /Adobe-Identity-UCS def",
    "/CMapType 2 def",
    "1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange",
    ...blocks,
    "endcmap",
    "CMapName currentdict /CMap defineresource pop",
    "end",
    "end",
  ].join("\n");
}

export type TextOptions = { font?: FontKey; size?: number; color?: Rgb; align?: "left" | "right" | "center" };

export class PdfBuilder {
  readonly pageWidth = 595.28;
  readonly pageHeight = 841.89;
  unsupported = 0;
  private pages: string[][] = [];
  private links: { page: number; rect: [number, number, number, number]; url: string }[] = [];
  private current = -1;
  private fonts: UnicodeFontSet | null = null;
  private readonly used = new Map<UniFontKey, Used>();
  private readonly laidCache = new Map<string, Laid>();

  /// `fonts` gives the embedded fonts when a text needs them (default: the Noto files of this repository, read once).
  constructor(
    private readonly info: { title: string; author: string; producer: string },
    private readonly options: { fonts?: () => UnicodeFontSet } = {},
  ) {}

  private embedded(): UnicodeFontSet {
    return (this.fonts ??= (this.options.fonts ?? loadUnicodeFonts)());
  }

  /// A text laid out with the embedded fonts (cached: `wrap` measures the same words again and again).
  private laid(text: string, font: FontKey): Laid {
    const cacheKey = `${font}\u0000${text}`;
    const hit = this.laidCache.get(cacheKey);
    if (hit) return hit;
    const fonts = this.embedded();
    const { runs, rtl } = visualRuns(text);
    const pieces: Laid["pieces"] = [];
    let unsupported = 0;
    let width = 0;
    for (const run of runs) {
      // Each character is drawn with its script's font, or with Noto Sans when that font lacks it (the Arabic font has no ASCII bracket, for one); a character neither has is a "?".
      // Consecutive characters in one font are shaped together.
      const own = uniKey(run.script, font === "bold");
      const sans = uniKey("sans", font === "bold");
      const parts: { key: UniFontKey; text: string }[] = [];
      for (const ch of run.text) {
        const cp = ch.codePointAt(0)!;
        let key = own;
        let drawn = ch;
        if (!fonts.has(own, cp)) {
          if (own !== sans && fonts.has(sans, cp)) key = sans;
          else if (cp === 0x200c || cp === 0x200d)
            continue; // a joiner the font has no glyph for: nothing to draw
          else {
            key = sans;
            drawn = "?";
            unsupported++;
          }
        }
        const last = parts[parts.length - 1];
        if (last && last.key === key) last.text += drawn;
        else parts.push({ key, text: drawn });
      }
      // A right-to-left run stands on the line in reverse: its parts too (each part's own glyphs are already reversed by the shaper).
      for (const part of run.level % 2 === 1 ? parts.reverse() : parts) {
        const glyphs = fonts.layout(part.key, part.text, run.level % 2 === 1);
        for (const g of glyphs) width += g.advance;
        pieces.push({ key: part.key, glyphs });
      }
    }
    const laid = { pieces, width, unsupported, rtl };
    this.laidCache.set(cacheKey, laid);
    return laid;
  }

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
    const t = text.normalize("NFC");
    if (needsUnicode(t)) return (this.laid(t, font).width * size) / 1000;
    let total = 0;
    for (const byte of encodeWinAnsi(t).bytes) total += charWidth(byte, font);
    return (total * size) / 1000;
  }

  /// Breaks a text into lines no wider than `maxWidth`: line ends in the text are kept, words are kept whole, and a word wider than a line is cut where it overflows.
  wrap(text: string, font: FontKey, size: number, maxWidth: number): string[] {
    const lines: string[] = [];
    for (const paragraph of text.normalize("NFC").replace(/\r\n?/g, "\n").split("\n")) {
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
        while (this.width(rest, font, size) > maxWidth) {
          // Cut between grapheme clusters, never between a letter and its mark.
          const parts = clusters(rest);
          if (parts.length <= 1) break;
          let cut = parts.length - 1;
          while (cut > 1 && this.width(parts.slice(0, cut).join(""), font, size) > maxWidth) cut--;
          lines.push(parts.slice(0, cut).join(""));
          rest = parts.slice(cut).join("");
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
    text = text.normalize("NFC");
    if (needsUnicode(text)) return this.unicodeText(x, y, text, font, size, options);
    const encoded = encodeWinAnsi(text);
    this.unsupported += encoded.unsupported;
    if (encoded.bytes.length === 0) return;
    const w = this.width(text, font, size);
    const left = options.align === "right" ? x - w : options.align === "center" ? x - w / 2 : x;
    this.ops().push(
      `BT /${RESOURCE[font]} ${num(size)} Tf ${colour(options.color ?? [0, 0, 0])} rg ${num(left)} ${num(y)} Td ${hex(encoded.bytes)} Tj ET`,
    );
  }

  /// A text that needs the embedded fonts: one text object, a font switch for each run, every glyph placed on its own (so a mark sits where the font puts it). The glyphs are in visual order
  /// and each glyph's ToUnicode entry says what it stands for, which is how browsers and word processors write Arabic: the readers that extract text undo the order themselves.
  private unicodeText(x: number, y: number, text: string, font: FontKey, size: number, options: TextOptions): void {
    const laid = this.laid(text, font);
    this.unsupported += laid.unsupported;
    if (laid.pieces.length === 0) return;
    const w = (laid.width * size) / 1000;
    let cursor = options.align === "right" ? x - w : options.align === "center" ? x - w / 2 : x;
    const parts = ["BT", `${colour(options.color ?? [0, 0, 0])} rg`];
    for (const piece of laid.pieces) {
      const used = this.usedFont(piece.key);
      parts.push(`/${resourceOf(piece.key)} ${num(size)} Tf`);
      for (const g of piece.glyphs) {
        const gid = used.subset.include(g.id);
        if (!used.widths.has(gid)) {
          used.widths.set(gid, this.embedded().advanceOf(piece.key, g.id));
          if (g.codePoints.length > 0) used.toUnicode.set(gid, g.codePoints);
        }
        parts.push(
          `1 0 0 1 ${num(cursor + (g.dx * size) / 1000)} ${num(y + (g.dy * size) / 1000)} Tm <${gid.toString(16).padStart(4, "0")}> Tj`,
        );
        cursor += (g.advance * size) / 1000;
      }
    }
    parts.push("ET");
    this.ops().push(parts.join(" "));
  }

  private usedFont(key: UniFontKey): Used {
    let used = this.used.get(key);
    if (!used) {
      used = { subset: this.embedded().createSubset(key), toUnicode: new Map(), widths: new Map() };
      this.used.set(key, used);
    }
    return used;
  }

  /// The objects of the embedded fonts that were used, five for each (the Type0 font, its CID font, the descriptor, the font file, the ToUnicode map), numbered from `first`.
  private fontObjects(first: number): { objects: (string | Buffer)[]; ids: Map<UniFontKey, number> } {
    const objects: (string | Buffer)[] = [];
    const ids = new Map<UniFontKey, number>();
    for (const key of UNI_KEYS) {
      const used = this.used.get(key);
      if (!used) continue;
      const base = first + objects.length;
      ids.set(key, base);
      const facts = this.embedded().facts(key);
      const name = `${SUBSET_TAG[key]}+${facts.postScriptName}`;
      const widths = [...used.widths].sort((a, b) => a[0] - b[0]);
      objects.push(
        `<< /Type /Font /Subtype /Type0 /BaseFont /${name} /Encoding /Identity-H /DescendantFonts [${base + 1} 0 R] /ToUnicode ${base + 4} 0 R >>`,
        `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${name} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${base + 2} 0 R /CIDToGIDMap /Identity /W [${widths.map(([gid, width]) => `${gid} [${num(width)}]`).join(" ")}] >>`,
        `<< /Type /FontDescriptor /FontName /${name} /Flags 4 /FontBBox [${facts.bbox.join(" ")}] /ItalicAngle ${num(facts.italicAngle)} /Ascent ${facts.ascent} /Descent ${facts.descent} /CapHeight ${facts.capHeight} /StemV ${key.endsWith("Bold") ? 140 : 80} /FontFile2 ${base + 3} 0 R >>`,
      );
      const raw = Buffer.from(used.subset.bytes());
      const packed = deflateSync(raw);
      objects.push(
        Buffer.concat([
          Buffer.from(`<< /Length ${packed.length} /Length1 ${raw.length} /Filter /FlateDecode >>\nstream\n`, "latin1"),
          packed,
          Buffer.from("\nendstream", "latin1"),
        ]),
      );
      const map = toUnicodeCMap(used.toUnicode);
      objects.push(`<< /Length ${Buffer.byteLength(map, "latin1")} >>\nstream\n${map}\nendstream`);
    }
    return { objects, ids };
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
    const objects: (string | Buffer)[] = [];
    objects.push("<< /Type /Catalog /Pages 2 0 R >>");
    objects.push(`<< /Type /Pages /Kids [${this.pages.map((_, i) => `${3 + i * 2} 0 R`).join(" ")}] /Count ${count} >>`);
    // The link annotations come after the document information, so every other object keeps its number.
    const firstAnnot = 7 + count * 2;
    // The embedded fonts come after the link annotations, so every other object keeps its number.
    const embedded = this.fontObjects(firstAnnot + this.links.length);
    const uniResources = [...embedded.ids].map(([key, id]) => `/${resourceOf(key)} ${id} 0 R`).join(" ");
    this.pages.forEach((ops, i) => {
      const pageId = 3 + i * 2;
      const streamId = pageId + 1;
      const annots = this.links.flatMap((l, k) => (l.page === i ? [`${firstAnnot + k} 0 R`] : []));
      objects.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.pageWidth} ${this.pageHeight}] /Contents ${streamId} 0 R${annots.length ? ` /Annots [${annots.join(" ")}]` : ""} /Resources << /Font << /F1 ${fontIds.regular} 0 R /F2 ${fontIds.bold} 0 R /F3 ${fontIds.mono} 0 R${uniResources ? ` ${uniResources}` : ""} >> >> >>`,
      );
      const content = ops.join("\n");
      objects.push(`<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`);
    });
    for (const key of ["regular", "bold", "mono"] as const)
      objects.push(`<< /Type /Font /Subtype /Type1 /BaseFont /${BASE_FONT[key]} /Encoding /WinAnsiEncoding >>`);
    const stamp = `D:${date.toISOString().replace(/[-:T]/g, "").slice(0, 14)}Z`;
    objects.push(
      `<< /Title ${infoString(this.info.title)} /Author ${infoString(this.info.author)} /Producer ${infoString(this.info.producer)} /CreationDate (${stamp}) >>`,
    );

    const infoId = objects.length;
    for (const l of this.links) {
      const url = l.url.replace(/([\\()])/g, "\\$1");
      objects.push(`<< /Type /Annot /Subtype /Link /Rect [${l.rect.map(num).join(" ")}] /Border [0 0 0] /A << /S /URI /URI (${url}) >> >>`);
    }
    objects.push(...embedded.objects);

    const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "latin1")];
    const offsets: number[] = [];
    let length = chunks[0].length;
    objects.forEach((body, i) => {
      offsets.push(length);
      const chunk = Buffer.concat([
        Buffer.from(`${i + 1} 0 obj\n`, "latin1"),
        typeof body === "string" ? Buffer.from(body, "latin1") : body,
        Buffer.from("\nendobj\n", "latin1"),
      ]);
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
