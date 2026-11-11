// `bidi-js` ships no types. Only what src/lib/pdf/unicode-text.ts uses (task 0045).
declare module "bidi-js" {
  export type EmbeddingLevels = {
    /// One level per UTF-16 code unit of the text (even: left to right, odd: right to left).
    levels: Uint8Array;
    paragraphs: { start: number; end: number; level: number }[];
  };
  export type Bidi = {
    getEmbeddingLevels(text: string, explicitDirection?: "ltr" | "rtl"): EmbeddingLevels;
    /// The mirror of a bracket-like character, or null when it has none.
    getMirroredCharacter(char: string): string | null;
  };
  export default function bidiFactory(): Bidi;
}
