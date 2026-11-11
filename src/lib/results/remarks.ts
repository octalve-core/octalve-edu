// The rules of report remarks (task 0036), pure: no database, no clock. The service (remarks-service.ts) feeds them what the database holds.

export const REMARK_MAX = 500;

export type RemarkKey = "teacherRemark" | "principalRemark";

/// A remark as typed. `null` and text that is only spaces clear the remark (the result is `null`); otherwise the text, trimmed, with every line end as `\n` and every tab as a space. More than
/// 500 characters (counted as a person counts them, not as UTF-16 does) or a control character that is not a line end is refused with the sentence to show.
export function cleanRemark(value: unknown): { ok: true; value: string | null } | { ok: false; message: string } {
  if (value === null) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false, message: "A remark is text." };
  const text = value.replace(/\r\n?/g, "\n").replace(/\t/g, " ").trim();
  if (/[\u0000-\u0009\u000B-\u001F\u007F\u2028\u2029]/.test(text))
    return { ok: false, message: "A remark cannot contain control characters." };
  if (text === "") return { ok: true, value: null };
  if (Array.from(text).length > REMARK_MAX) return { ok: false, message: `A remark can be at most ${REMARK_MAX} characters.` };
  return { ok: true, value: text };
}

/// What a person may write on the card of a pupil of one arm: the principal's remark is the school administrator's alone; the teacher's is the administrator's, the teacher's who is assigned to the
/// pupil's arm, or a campus administrator's for a pupil in a class of their own campus (task 0046). `reachesThePupilsArm` says whether the arm is one this person teaches (a teacher) or is a class of
/// their own campus (a campus administrator). Everyone else (non-teaching staff, a pupil, a parent) writes nothing.
export function remarkPermissions(role: string, reachesThePupilsArm: boolean): { teacher: boolean; principal: boolean } {
  if (role === "ADMIN") return { teacher: true, principal: true };
  if (role === "TEACHING_STAFF" || role === "CAMPUS_ADMIN") return { teacher: reachesThePupilsArm, principal: false };
  return { teacher: false, principal: false };
}

/// Whether a viewer is shown the remarks. Staff see them as they are being written; a pupil or a parent only once any of the pupil's results for the term is published or locked, which is also
/// the moment they stop being editable, so what is seen does not change afterwards.
export function remarksVisibleTo(role: string, anyPublishedOrLocked: boolean): boolean {
  return role === "STUDENT" || role === "PARENT" ? anyPublishedOrLocked : true;
}

export type RemarkChange = "set" | "changed" | "cleared";

/// What a save did to one remark, for the audit log (never the words): nothing when the new value equals the stored one.
export function remarkChange(before: string | null, after: string | null): RemarkChange | null {
  if (before === after) return null;
  if (before === null) return "set";
  return after === null ? "cleared" : "changed";
}
