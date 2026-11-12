import type { PlaceState } from "./people-rules";

// Programs, slice P5: the pure rules of completing a place or a program and of the wording of a certificate (task 0027, section 12). No database, no clock.

export const CERT_PLACEHOLDERS = ["name", "program", "from", "to", "school"] as const;
export const MAX_CERT_TITLE = 80;
export const MAX_CERT_BODY = 600;
export const MAX_SIGNATORIES = 2;
export const MAX_SIGNATORY_FIELD = 60;
export const MAX_ISSUE_BATCH = 500;
export const MIN_REASON_LENGTH = 3;

export type Signatory = { name: string; title: string };

/// Placeholders in a wording that are not one of ours (`{nme}`): refused when the wording is saved, so a typo never reaches a printed certificate.
export function unknownPlaceholders(text: string): string[] {
  const found = [...text.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1]!);
  return [...new Set(found.filter((name) => !(CERT_PLACEHOLDERS as readonly string[]).includes(name)))];
}

/// Fills the placeholders in one pass: what is put in is never read for placeholders again (a person named "{school}" stays named "{school}"). Text only, never markup.
export function fillWording(template: string, values: Record<(typeof CERT_PLACEHOLDERS)[number], string>): string {
  return template.replace(/\{(name|program|from|to|school)\}/g, (_all, key: keyof typeof values) => values[key]);
}

/// The person as the public check page shows them: the first name and the initial of the last ("Aisha Bello" -> "Aisha B."). A certificate may be for a child.
export function maskName(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0]!;
  return `${parts[0]} ${Array.from(parts[parts.length - 1]!)[0]!.toUpperCase()}.`;
}

export const certificateSerial = (year: number, seq: number): string => `CERT-${year}-${String(seq).padStart(4, "0")}`;

/// "2026-11-03" -> "3 November 2026" (a calendar day, in UTC, never shifted by a time zone).
export function longDate(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export function parseSignatories(json: unknown): Signatory[] {
  if (!Array.isArray(json)) return [];
  return json
    .flatMap((s) =>
      s && typeof s === "object" && typeof (s as Signatory).name === "string" && typeof (s as Signatory).title === "string"
        ? [{ name: (s as Signatory).name, title: (s as Signatory).title }]
        : [],
    )
    .slice(0, MAX_SIGNATORIES);
}

/// A whole program is completed only if it is fixed-term, active, and has reached its end date (the last day counts). A continuous program is archived, never completed as a whole.
export function programCompletable(
  program: { kind: string; status: string; endsOn: string | null },
  today: string,
): { ok: boolean; why: string | null } {
  if (program.kind !== "FIXED_TERM")
    return { ok: false, why: "A program that never ends is archived, not completed. Complete people one by one." };
  if (program.status !== "ACTIVE")
    return {
      ok: false,
      why: program.status === "COMPLETED" ? "This program is already completed." : "Only an active program can be completed.",
    };
  if (!program.endsOn) return { ok: false, why: "The program has no end date." };
  if (today < program.endsOn) return { ok: false, why: "The program has not reached its end date yet." };
  return { ok: true, why: null };
}

/// Whether one place can be completed now: it is open and the person is taking part. A suspended, expelled, terminated or departed person's place is not completed.
export function placeCompletable(status: string, state: PlaceState): { ok: boolean; why: string | null } {
  if (status !== "ACTIVE") return { ok: false, why: "The place is not open." };
  if (state === "SUSPENDED") return { ok: false, why: "Suspended: lift the suspension first." };
  if (state !== "ACTIVE") return { ok: false, why: "Not taking part any more." };
  return { ok: true, why: null };
}

/// Why a wording cannot be saved, or null.
export function wordingProblem(input: { title: string; body: string; signatories: readonly Signatory[] }): string | null {
  if (input.title.length < 1 || input.title.length > MAX_CERT_TITLE) return `The title is 1 to ${MAX_CERT_TITLE} characters.`;
  if (input.body.length < 1 || input.body.length > MAX_CERT_BODY) return `The wording is 1 to ${MAX_CERT_BODY} characters.`;
  const unknown = unknownPlaceholders(`${input.title} ${input.body}`);
  if (unknown.length > 0)
    return `${unknown.map((u) => `{${u}}`).join(", ")} ${unknown.length === 1 ? "is not a placeholder" : "are not placeholders"}. Use {name}, {program}, {from}, {to} or {school}.`;
  if (input.signatories.length > MAX_SIGNATORIES) return `At most ${MAX_SIGNATORIES} signatories.`;
  if (input.signatories.some((s) => s.name.length < 1 || s.name.length > MAX_SIGNATORY_FIELD || s.title.length > MAX_SIGNATORY_FIELD))
    return `A signatory has a name and an optional title, each up to ${MAX_SIGNATORY_FIELD} characters.`;
  return null;
}
