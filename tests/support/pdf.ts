// Reading back the PDFs this app writes (task 0038), for tests. The writer puts every page's content in an uncompressed stream and every text in a hex string, so a test can read what a page says
// without a PDF library, and can check the file is well formed (its cross-reference table points at real objects). A text drawn with an embedded font (task 0045) is written as glyph numbers:
// it is read back through the font's own ToUnicode map, which is also what a viewer uses to copy it. Glyphs stand in the order they are drawn, which for right-to-left text is the visual order.

const latin1 = (buf: Buffer) => buf.toString("latin1");

// Windows-1252 bytes 0x80 to 0x9F, back to characters.
const CP1252_BACK: Record<number, string> = {
  0x80: "€",
  0x82: "‚",
  0x83: "ƒ",
  0x84: "„",
  0x85: "…",
  0x86: "†",
  0x87: "‡",
  0x88: "ˆ",
  0x89: "‰",
  0x8a: "Š",
  0x8b: "‹",
  0x8c: "Œ",
  0x8e: "Ž",
  0x91: "‘",
  0x92: "’",
  0x93: "“",
  0x94: "”",
  0x95: "•",
  0x96: "–",
  0x97: "—",
  0x98: "˜",
  0x99: "™",
  0x9a: "š",
  0x9b: "›",
  0x9c: "œ",
  0x9e: "ž",
  0x9f: "Ÿ",
};
const decode = (hex: string) =>
  hex
    .match(/../g)!
    .map((h) => {
      const byte = parseInt(h, 16);
      return CP1252_BACK[byte] ?? String.fromCharCode(byte);
    })
    .join("");

/// Every object of the file by number, as the text between `N 0 obj` and `endobj` (a binary stream is in there too, one character a byte).
function objectsOf(raw: string): Map<number, string> {
  const objects = new Map<number, string>();
  for (const m of raw.matchAll(/(\d+) 0 obj\n([\s\S]*?)\nendobj/g)) objects.set(Number(m[1]), m[2]);
  return objects;
}

const pageIdsOf = (raw: string): number[] =>
  [...raw.matchAll(/\/Type \/Pages \/Kids \[([^\]]*)\]/g)][0]?.[1].match(/\d+(?= 0 R)/g)?.map(Number) ?? [];

/// The glyph-number to text map of an embedded font: what its `ToUnicode` CMap says each code stands for.
function toUnicodeOf(fontObject: string, objects: Map<number, string>): Map<number, string> {
  const id = /\/ToUnicode (\d+) 0 R/.exec(fontObject)?.[1];
  const map = new Map<number, string>();
  const body = id ? (objects.get(Number(id)) ?? "") : "";
  for (const m of body.matchAll(/<([0-9a-f]{4})> <([0-9a-f]+)>/gi)) {
    const units = m[2].match(/.{4}/g)!.map((u) => parseInt(u, 16));
    map.set(parseInt(m[1], 16), String.fromCharCode(...units));
  }
  return map;
}

/// The text of every page, one string per page: each shown text on its own line, in drawing order.
export function pdfPages(buf: Buffer): string[] {
  const raw = latin1(buf);
  const objects = objectsOf(raw);
  return pageIdsOf(raw).map((pageId) => {
    const page = objects.get(pageId) ?? "";
    const content = objects.get(Number(/\/Contents (\d+) 0 R/.exec(page)?.[1])) ?? "";
    // The fonts this page names: F1 to F3 are the standard ones (WinAnsi), U1 to U4 the embedded ones.
    const embedded = new Map<string, Map<number, string>>();
    for (const m of (/\/Font << ([^>]*) >>/.exec(page)?.[1] ?? "").matchAll(/\/(U\d) (\d+) 0 R/g))
      embedded.set(m[1], toUnicodeOf(objects.get(Number(m[2])) ?? "", objects));
    const lines: string[] = [];
    for (const block of content.matchAll(/BT ([\s\S]*?) ET/g)) {
      let font = "F1";
      let line = "";
      for (const t of block[1].matchAll(/\/(\w+) [\d.]+ Tf|<([0-9a-f]+)> Tj/g)) {
        if (t[1]) font = t[1];
        else if (embedded.has(font)) {
          const glyphs = embedded.get(font)!;
          line += t[2]
            .match(/.{4}/g)!
            .map((code) => glyphs.get(parseInt(code, 16)) ?? "\ufffd")
            .join("");
        } else line += decode(t[2]);
      }
      lines.push(line);
    }
    return lines.join("\n");
  });
}

/// The names of the embedded fonts the file has (`AAAAAA+NotoSans-Regular`, ...): empty when every text is drawn with the standard fonts.
export function pdfEmbeddedFonts(buf: Buffer): string[] {
  return [...latin1(buf).matchAll(/\/Subtype \/CIDFontType2 \/BaseFont \/(\S+)/g)].map((m) => m[1]);
}

/// Every clickable link in the file: the page it is on (0-based), the address it opens and its rectangle [x1, y1, x2, y2]. Only `/Subtype /Link` annotations with a URI action are listed.
export function pdfLinks(buf: Buffer): { page: number; url: string; rect: number[] }[] {
  const raw = latin1(buf);
  const objects = new Map<number, string>();
  for (const m of raw.matchAll(/(\d+) 0 obj\n([\s\S]*?)\nendobj/g)) objects.set(Number(m[1]), m[2]);
  const pageIds = [...raw.matchAll(/\/Type \/Pages \/Kids \[([^\]]*)\]/g)][0]?.[1].match(/\d+(?= 0 R)/g)?.map(Number) ?? [];
  const links: { page: number; url: string; rect: number[] }[] = [];
  pageIds.forEach((id, page) => {
    const annots = /\/Annots \[([^\]]*)\]/.exec(objects.get(id) ?? "")?.[1].match(/\d+(?= 0 R)/g) ?? [];
    for (const a of annots) {
      const body = objects.get(Number(a)) ?? "";
      const url = /\/URI \(((?:[^()\\]|\\.)*)\)/.exec(body)?.[1]?.replace(/\\(.)/g, "$1");
      const rect = /\/Rect \[([^\]]*)\]/.exec(body)?.[1].split(" ").map(Number);
      if (/\/Subtype \/Link/.test(body) && url !== undefined && rect) links.push({ page, url, rect });
    }
  });
  return links;
}

/// The page count the file declares.
export function pdfDeclaredPages(buf: Buffer): number {
  return Number(/\/Type \/Pages [^>]*\/Count (\d+)/.exec(latin1(buf))?.[1] ?? NaN);
}

/// Every object in the cross-reference table starts at the byte the table says, and the trailer names a root and a size that match: the file is well formed.
export function pdfProblems(buf: Buffer): string[] {
  const raw = latin1(buf);
  const problems: string[] = [];
  if (!raw.startsWith("%PDF-1.4\n")) problems.push("no %PDF-1.4 header");
  if (!raw.trimEnd().endsWith("%%EOF")) problems.push("no %%EOF");
  const start = Number(/startxref\n(\d+)\n%%EOF/.exec(raw)?.[1]);
  if (!Number.isFinite(start) || raw.slice(start, start + 4) !== "xref") {
    problems.push("startxref does not point at the xref table");
    return problems;
  }
  const table = /xref\n0 (\d+)\n((?:\d{10} \d{5} [nf] \n)+)/.exec(raw.slice(start));
  if (!table) return [...problems, "no xref entries"];
  const size = Number(table[1]);
  const entries = table[2].match(/\d{10} \d{5} [nf] \n/g)!;
  if (entries.length !== size) problems.push(`the table says ${size} entries and has ${entries.length}`);
  entries.forEach((entry, i) => {
    if (i === 0) return;
    const offset = Number(entry.slice(0, 10));
    if (!raw.startsWith(`${i} 0 obj\n`, offset)) problems.push(`object ${i} is not at byte ${offset}`);
  });
  if (!new RegExp(`/Size ${size} /Root 1 0 R`).test(raw)) problems.push("the trailer's size or root is wrong");
  // A page's annotations are real link objects.
  for (const m of raw.matchAll(/\/Annots \[([^\]]*)\]/g))
    for (const id of m[1].match(/\d+(?= 0 R)/g) ?? []) {
      const at = raw.indexOf(`\n${id} 0 obj\n`);
      if (at < 0 || !/^<< \/Type \/Annot \/Subtype \/Link /.test(raw.slice(at + `\n${id} 0 obj\n`.length, at + 120)))
        problems.push(`annotation ${id} is not a link object`);
    }
  // Every stream is as long as its dictionary says (a binary font file is the likeliest thing to be cut or padded), and every object it points at exists.
  const objects = objectsOf(raw);
  for (const [id, body] of objects) {
    const stream = /^<<([^>]*)>>\nstream\n([\s\S]*)\nendstream$/.exec(body);
    if (!stream) continue;
    const length = Number(/\/Length (\d+)/.exec(stream[1])?.[1]);
    if (length !== stream[2].length) problems.push(`stream ${id} says ${length} bytes and has ${stream[2].length}`);
  }
  for (const [id, body] of objects)
    for (const ref of body
      .slice(0, 600)
      .matchAll(/(?:\/FontFile2|\/ToUnicode|\/FontDescriptor|\/Contents) (\d+) 0 R|\/DescendantFonts \[(\d+) 0 R\]/g)) {
      const target = Number(ref[1] ?? ref[2]);
      if (!objects.has(target)) problems.push(`object ${id} points at ${target}, which is not in the file`);
    }
  return problems;
}
