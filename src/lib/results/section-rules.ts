import { cleanName } from "@/lib/academics/rules";

// The pure rules of sections and approver scopes (ADR 0018), judged without a database so every one is a table in a unit test. The service
// (approver-settings.ts) asks these first, then asks the database about what only the database knows (does the section exist in this school).

export const SECTION_NAME_MAX = 80; // the database check says the same: 1 to 80 characters
export const SCOPES_PER_PERSON_MAX = 100;

/// A section's name: trimmed, inner whitespace collapsed, 1 to 80 characters. Returns null when it cannot be one.
export const cleanSectionName = (value: unknown): string | null => cleanName(value, SECTION_NAME_MAX);

export type ScopeEntry = { kind: "GENERAL" } | { kind: "SECTION"; sectionId: string } | { kind: "CLASS"; classGroupId: string };

export const scopeKey = (entry: ScopeEntry): string =>
  entry.kind === "GENERAL" ? "GENERAL" : entry.kind === "SECTION" ? `SECTION:${entry.sectionId}` : `CLASS:${entry.classGroupId}`;

const ORDER = { GENERAL: 0, SECTION: 1, CLASS: 2 } as const;

export type ScopeSetProblem = "GENERAL_WITH_OTHERS";

/// The set an administrator asked for, made canonical: a repeated entry is one entry; the order is fixed (General, then sections, then classes, each by id), so the audit
/// row of an unchanged set is the same row. A GENERAL entry together with others is refused: General already covers everything, and keeping the others would
/// make the narrower entries look like they still mean something.
export function normaliseScopeSet(
  entries: readonly ScopeEntry[],
): { ok: true; scopes: ScopeEntry[] } | { ok: false; problem: ScopeSetProblem } {
  const unique = new Map<string, ScopeEntry>();
  for (const entry of entries) unique.set(scopeKey(entry), entry);
  const scopes = [...unique.values()].sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || scopeKey(a).localeCompare(scopeKey(b)));
  if (scopes.length > 1 && scopes.some((entry) => entry.kind === "GENERAL")) return { ok: false, problem: "GENERAL_WITH_OTHERS" };
  return { ok: true, scopes };
}

/// A section and a class group belong together only when they sit in the same campus (a section with no campus holds class groups with no campus).
export const sameCampus = (a: string | null, b: string | null): boolean => (a ?? null) === (b ?? null);
