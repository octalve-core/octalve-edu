import { fail } from "@/lib/api/envelope";

/// Why a submission or a quiz attempt was refused. The service decides; this file says it in HTTP.
///   NOT_FOUND          the assignment, the quiz or the named student is not in this school (a student that is archived is not)
///   NOT_YOURS          a student named a student record that is not their own
///   NO_STUDENT_RECORD  a student membership with no student record behind it
///   STUDENT_REQUIRED   staff submitting on a student's behalf did not say which student
///   ALREADY_MARKED     a student handing in work again over work that has been marked
///   CLOSED             a student handing in work after the due date of an assignment that takes no late work
export type LmsFailure = "NOT_FOUND" | "NOT_YOURS" | "NO_STUDENT_RECORD" | "STUDENT_REQUIRED" | "ALREADY_MARKED" | "CLOSED";

export type LmsServiceResult<T> = { ok: true; data: T } | { ok: false; failure: LmsFailure; detail?: string };

export function lmsFailure(reason: LmsFailure, detail?: string): Response {
  switch (reason) {
    case "NOT_FOUND":
      return fail(detail ?? "Not found.", 404, "NOT_FOUND");
    case "NOT_YOURS":
      return fail(detail ?? "You can only submit your own work.", 403, "FORBIDDEN");
    case "NO_STUDENT_RECORD":
      return fail(detail ?? "Your account has no student record in this school.", 403, "FORBIDDEN");
    case "STUDENT_REQUIRED":
      return fail(detail ?? "Say which student this is for: studentId is required.", 400, "VALIDATION");
    case "ALREADY_MARKED":
      return fail(detail ?? "This work has already been marked, so it can no longer be changed.", 409, "ALREADY_MARKED");
    case "CLOSED":
      return fail(detail ?? "This assignment is no longer accepting work.", 409, "CLOSED");
  }
}
