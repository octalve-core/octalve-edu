// The signed-in shell's two remembered choices: is the sidebar folded to icons, and which of its
// sections are folded. Like the theme (src/lib/theme.ts) they live in plain cookies so the SERVER
// renders the right width and the right open sections on the very first paint (no flash, hydration
// always agrees) and no inline <script> is needed. Not secrets and not authentication:
// SameSite=Lax, readable by script (the sidebar sets them), and every value is checked against what
// is known, so a hand-edited cookie can only pick one of the states the screen already has.

export const SIDEBAR_COOKIE = "sidebar";
export const SIDEBAR_SECTIONS_COOKIE = "sidebar-sections";
export const SHELL_PREFS_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

/// Expanded unless the cookie says "collapsed" exactly; anything else (missing, empty, unknown) is the default.
export function parseSidebarCollapsed(value: string | undefined | null): boolean {
  return value === "collapsed";
}

export function serializeSidebarCollapsed(collapsed: boolean): string {
  return collapsed ? "collapsed" : "expanded";
}

/// The folded sections, as a list of ids: only ids in `known`, each once, in the order of `known`.
export function parseFoldedSections<T extends string>(value: string | undefined | null, known: readonly T[]): T[] {
  if (!value) return [];
  const asked = new Set(value.split(","));
  return known.filter((id) => asked.has(id));
}

export function serializeFoldedSections(folded: Iterable<string>): string {
  return Array.from(new Set(folded)).join(",");
}
