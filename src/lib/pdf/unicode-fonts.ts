import { readFileSync } from "node:fs";
import path from "node:path";
import * as fontkit from "fontkit";

// The fonts that draw text WinAnsi cannot (task 0045): Noto Sans (Latin with every Yoruba letter and mark, Greek, Cyrillic) and Noto Naskh Arabic, each in regular and bold, under the SIL Open Font
// License (src/lib/pdf/fonts/OFL.txt). `fontkit` lays text out (substitutions, mark positions, kerning) and cuts a subset of a font for a document; this file is the only place that knows it.
// Reading the files is the only I/O the PDF writer ever does, once per process, the first time a text needs them.

export type UniFontKey = "sans" | "sansBold" | "naskh" | "naskhBold";
export const UNI_KEYS: readonly UniFontKey[] = ["sans", "sansBold", "naskh", "naskhBold"];

const FILES: Record<UniFontKey, string> = {
  sans: "NotoSans-Regular.ttf",
  sansBold: "NotoSans-Bold.ttf",
  naskh: "NotoNaskhArabic-Regular.ttf",
  naskhBold: "NotoNaskhArabic-Bold.ttf",
};

/// One glyph as it is placed on the line, in thousandths of an em: how far to move on, and where it sits relative to the pen (a mark above or below its letter).
export type LaidGlyph = { id: number; advance: number; dx: number; dy: number; codePoints: number[] };

/// What a PDF font descriptor needs, in thousandths of an em.
export type FontFacts = {
  postScriptName: string;
  ascent: number;
  descent: number;
  capHeight: number;
  italicAngle: number;
  bbox: [number, number, number, number];
};

/// A font cut down to the glyphs a document uses. `include` returns the glyph's number in the subset (the code the text writes); `bytes` is the TrueType file.
export type FontSubset = { include(glyphId: number): number; bytes(): Uint8Array };

export class UnicodeFontSet {
  // Two instances of each font, on purpose. `fontkit` keeps one glyph object per glyph number for the life of a font, with the characters of whoever made it first; cutting a subset makes
  // the component glyphs of the composite glyphs it holds (the `e` of `é`) without any characters. If layout and subsets shared an instance, whether `e` knew it stood for "e" would depend on
  // which document the process wrote first. `fonts` only lays text out; `cutters` only cuts subsets and reads advances.
  private readonly fonts = new Map<UniFontKey, fontkit.Font>();
  private readonly cutters = new Map<UniFontKey, fontkit.Font>();
  private readonly files = new Map<UniFontKey, Buffer>();
  constructor(private readonly dir: string) {}

  private open(key: UniFontKey, pool: Map<UniFontKey, fontkit.Font>): fontkit.Font {
    let font = pool.get(key);
    if (!font) {
      let file = this.files.get(key);
      if (!file) this.files.set(key, (file = readFileSync(path.join(this.dir, FILES[key]))));
      const made = fontkit.create(file);
      if (!("layout" in made)) throw new Error(`${FILES[key]} is a font collection, not a font.`);
      font = made;
      pool.set(key, font);
    }
    return font;
  }

  private font(key: UniFontKey): fontkit.Font {
    return this.open(key, this.fonts);
  }

  private cutter(key: UniFontKey): fontkit.Font {
    return this.open(key, this.cutters);
  }

  private scale(key: UniFontKey): number {
    return 1000 / this.font(key).unitsPerEm;
  }

  has(key: UniFontKey, codePoint: number): boolean {
    return this.font(key).hasGlyphForCodePoint(codePoint);
  }

  /// A text laid out in the order it is drawn, left to right: a right-to-left run comes back already in visual order (the shaper reverses it).
  layout(key: UniFontKey, text: string, rtl: boolean): LaidGlyph[] {
    const font = this.font(key);
    const k = this.scale(key);
    const run = font.layout(text, undefined, undefined, undefined, rtl ? "rtl" : "ltr");
    return run.glyphs.map((glyph, i) => {
      const p = run.positions[i];
      return { id: glyph.id, advance: p.xAdvance * k, dx: p.xOffset * k, dy: p.yOffset * k, codePoints: [...glyph.codePoints] };
    });
  }

  /// The advance of a glyph by its id in the whole font, in thousandths of an em.
  advanceOf(key: UniFontKey, glyphId: number): number {
    return this.cutter(key).getGlyph(glyphId).advanceWidth * this.scale(key);
  }

  facts(key: UniFontKey): FontFacts {
    const font = this.font(key);
    const k = this.scale(key);
    const { minX, minY, maxX, maxY } = font.bbox;
    return {
      postScriptName: font.postscriptName,
      ascent: Math.round(font.ascent * k),
      descent: Math.round(font.descent * k),
      capHeight: Math.round(font.capHeight * k),
      italicAngle: font.italicAngle,
      bbox: [Math.round(minX * k), Math.round(minY * k), Math.round(maxX * k), Math.round(maxY * k)],
    };
  }

  /// A subset to which glyphs are added as the document uses them. The glyph numbers it hands back are the codes of the text, and the order they are handed out in is the order the subset
  /// holds them in (the notdef glyph is always number 0).
  createSubset(key: UniFontKey): FontSubset {
    const subset = this.cutter(key).createSubset();
    // The published types say `includeGlyph` answers a boolean; it answers the glyph's number in the subset.
    const include = subset.includeGlyph.bind(subset) as unknown as (glyph: number | { id: number }) => number;
    return { include: (glyphId) => include(glyphId), bytes: () => subset.encode() };
  }
}

let shared: UnicodeFontSet | null = null;
/// The fonts, read from `src/lib/pdf/fonts` under the working directory (next.config.ts copies that folder into a deployed function) the first time they are asked for.
export function loadUnicodeFonts(): UnicodeFontSet {
  return (shared ??= new UnicodeFontSet(path.join(process.cwd(), "src", "lib", "pdf", "fonts")));
}
