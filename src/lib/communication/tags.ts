// Which {{tags}} a broadcast can fill in, and for whom (task 0056). Pure, no database: the Broadcast Composer reads this to offer a chip, and the input check reads it to refuse a message that
// holds a tag nobody would fill, so a chip is never offered that the server will not fill and a guardian never receives the text "{{class_arm}}".
//
// The values themselves are made by `createBroadcast` (service.ts): the school's name, today's date in the school's time zone, and, for a guardian, their children's names and classes.

export type TagGroup = "GUARDIANS" | "STAFF";

export type BroadcastTag = { token: string; label: string; groups: readonly TagGroup[] };

/// Every tag a broadcast can fill. `token` is the name between the braces.
export const BROADCAST_TAGS: readonly BroadcastTag[] = [
  { token: "student_name", label: "Student Name", groups: ["GUARDIANS"] },
  { token: "class_arm", label: "Class Arm", groups: ["GUARDIANS"] },
  { token: "school_name", label: "School Name", groups: ["GUARDIANS", "STAFF"] },
  { token: "date", label: "Today's Date", groups: ["GUARDIANS", "STAFF"] },
];

/// The groups of people a target audience reaches: "All Community" is both, and a tag is fillable there only if it is fillable for both.
export function groupsOf(audienceRole: string): readonly TagGroup[] {
  if (audienceRole === "GUARDIAN") return ["GUARDIANS"];
  if (audienceRole === "STAFF") return ["STAFF"];
  return ["GUARDIANS", "STAFF"];
}

/// The tags that can be filled for an audience, in the order the composer shows them.
export function tagsFor(audienceRole: string): BroadcastTag[] {
  const groups = groupsOf(audienceRole);
  return BROADCAST_TAGS.filter((tag) => groups.every((group) => tag.groups.includes(group)));
}

const TOKEN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g; // the same shape `interpolateTokens` replaces

/// The names of the tags a text holds, once each, in the order they first appear.
export function tagsIn(text: string | null | undefined): string[] {
  if (!text) return [];
  const seen: string[] = [];
  for (const match of text.matchAll(TOKEN)) if (!seen.includes(match[1])) seen.push(match[1]);
  return seen;
}

/// The tags in these texts that nobody would fill for this audience.
export function findUnfillableTags(texts: (string | null | undefined)[], audienceRole: string): string[] {
  const fillable = new Set(tagsFor(audienceRole).map((tag) => tag.token));
  const bad: string[] = [];
  for (const text of texts) for (const name of tagsIn(text)) if (!fillable.has(name) && !bad.includes(name)) bad.push(name);
  return bad;
}

/// The words of the audience, for a sentence ("These tags cannot be filled for staff").
export function audienceWords(audienceRole: string): string {
  if (audienceRole === "GUARDIAN") return "guardians";
  if (audienceRole === "STAFF") return "staff";
  return "the whole community (staff have no pupil)";
}

/// "A", "A and B", "A, B and C": names or classes written the way a person would write them. Each once, in order.
export function joinNames(names: readonly string[]): string {
  const unique = names.filter((name, index) => name && names.indexOf(name) === index);
  if (unique.length <= 1) return unique[0] ?? "";
  return `${unique.slice(0, -1).join(", ")} and ${unique[unique.length - 1]}`;
}

/// Today's date written for a message ("12 November 2026"), in the school's time zone.
export function messageDate(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone }).format(now);
}
