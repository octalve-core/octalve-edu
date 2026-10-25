import type { ClassGroupView, ScopeView, SectionView } from "./approver-settings";
import { sameCampus, type ScopeEntry } from "./section-rules";

// What the Results approval tab (ADR 0018, task 0020 slice 3) decides without a browser: which sections a class can be moved to, which classes and sections an approver may be
// offered, and the plain words for a set of scopes. Pure, so each is a table in a unit test; the server stays the judge (the same rules refuse the same things), and the screen
// simply never offers what the server would refuse.

/// Whether something on `itemCampusId` fits a person tied to `personCampusId` (null: tied to none). The server's own test when it saves a person's scopes: a person with no campus
/// fits everything, and an item with no campus fits everybody.
export const fitsCampus = (personCampusId: string | null, itemCampusId: string | null): boolean =>
  personCampusId === null || itemCampusId === null || itemCampusId === personCampusId;

/// The live sections a class group can be put in: the ones on its own campus (a section with no campus takes only class groups with no campus), and not the one it is in.
export const placementTargets = (group: ClassGroupView, sections: readonly SectionView[]): SectionView[] =>
  sections.filter((section) => !section.archived && section.id !== group.sectionId && sameCampus(section.campusId, group.campusId));

export function describeScope(scope: ScopeView): string {
  if (scope.kind === "GENERAL") return "Everything";
  if (scope.kind === "SECTION") return `Section: ${scope.sectionName ?? "unknown"}`;
  return `Class: ${scope.classGroupName ?? "unknown"}`;
}

/// "Nothing" for no scope at all (the person approves nothing: the setting fails closed), else the scopes in the order they are kept (General, sections, classes).
export const describeScopes = (scopes: readonly ScopeView[]): string =>
  scopes.length === 0 ? "Nothing" : scopes.map(describeScope).join(", ");

/// The scopes of a person as the entries the API takes, in the canonical order: General alone, or the sections and then the classes.
export function scopeEntries(general: boolean, sectionIds: readonly string[], classGroupIds: readonly string[]): ScopeEntry[] {
  if (general) return [{ kind: "GENERAL" }];
  return [
    ...[...sectionIds].sort().map((sectionId): ScopeEntry => ({ kind: "SECTION", sectionId })),
    ...[...classGroupIds].sort().map((classGroupId): ScopeEntry => ({ kind: "CLASS", classGroupId })),
  ];
}

/// The entries a person holds now, in the same shape, to tell whether the editor changed anything.
export const heldEntries = (scopes: readonly ScopeView[]): ScopeEntry[] =>
  scopeEntries(
    scopes.some((scope) => scope.kind === "GENERAL"),
    scopes.flatMap((scope) => (scope.kind === "SECTION" && scope.sectionId ? [scope.sectionId] : [])),
    scopes.flatMap((scope) => (scope.kind === "CLASS" && scope.classGroupId ? [scope.classGroupId] : [])),
  );

export const sameEntries = (a: readonly ScopeEntry[], b: readonly ScopeEntry[]): boolean => {
  const key = (e: ScopeEntry) => (e.kind === "GENERAL" ? "G" : e.kind === "SECTION" ? `S:${e.sectionId}` : `C:${e.classGroupId}`);
  return a.length === b.length && a.every((entry, index) => key(entry) === key(b[index]));
};

/// "Teaching staff" for TEACHING_STAFF.
export const roleLabel = (role: string): string => {
  const words = role.toLowerCase().replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
};
