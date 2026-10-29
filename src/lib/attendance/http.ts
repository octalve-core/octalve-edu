import { z } from "zod";
import { fail } from "@/lib/api/envelope";
import { isIsoDate } from "@/lib/academics/rules";
import { isPlausibleId } from "@/lib/academics/http";
import { AttendanceStatus, AttendanceSource } from "./rules";

export const READ_ROLES = ["ADMIN", "CAMPUS_ADMIN", "TEACHING_STAFF", "NON_TEACHING_STAFF"] as const;
/// A CAMPUS_ADMIN takes the roll only of an arm of THEIR campus: the arm route asks lib/auth/campus-scope before it writes (the route-role guard test checks).
export const WRITE_ROLES = ["ADMIN", "CAMPUS_ADMIN", "TEACHING_STAFF"] as const;

export const isoDateField = z.string({ error: "Give a date as YYYY-MM-DD." }).refine(isIsoDate, "Use a real date, written YYYY-MM-DD.");

export const attendanceRecordItemSchema = z.strictObject({
  studentId: z.string().min(1, "Student ID is required").refine(isPlausibleId, "Not a valid student id."),
  status: z.nativeEnum(AttendanceStatus, {
    error: "Status must be PRESENT, ABSENT, LATE, or EXCUSED",
  }),
  remarks: z.string().max(500, "Remarks cannot exceed 500 characters").optional().nullable(),
});

export const bulkMarkAttendanceSchema = z.strictObject({
  date: isoDateField,
  records: z
    .array(attendanceRecordItemSchema, {
      error: "Provide attendance records as a list",
    })
    .min(1, "Provide at least one student attendance record")
    .superRefine((records, ctx) => {
      const seen = new Set<string>();
      records.forEach((record, index) => {
        if (seen.has(record.studentId))
          ctx.addIssue({ code: "custom", path: [index, "studentId"], message: "This student appears twice." });
        seen.add(record.studentId);
      });
    }),
  source: z.nativeEnum(AttendanceSource).optional().default(AttendanceSource.ONLINE),
});

export type BulkMarkAttendanceInput = z.infer<typeof bulkMarkAttendanceSchema>;

export type AttendanceFailure =
  | "NOT_FOUND"
  | "FUTURE_DATE_NOT_ALLOWED"
  | "EDIT_WINDOW_EXPIRED"
  | "UNAUTHORIZED"
  | "SESSION_NOT_ACTIVE"
  | "OUTSIDE_SESSION"
  | "INVALID_STUDENTS";

export function attendanceFailure(reason: AttendanceFailure): Response {
  switch (reason) {
    case "NOT_FOUND":
      return fail("No such class arm or resource.", 404, "NOT_FOUND");
    case "FUTURE_DATE_NOT_ALLOWED":
      return fail("Attendance cannot be recorded for future dates.", 400, "FUTURE_DATE_NOT_ALLOWED");
    case "EDIT_WINDOW_EXPIRED":
      return fail(
        "The edit window for this attendance record has expired. Only an administrator can edit historical records older than 7 days.",
        403,
        "EDIT_WINDOW_EXPIRED",
      );
    case "SESSION_NOT_ACTIVE":
      return fail("There is no active academic session for this date.", 409, "SESSION_NOT_ACTIVE");
    case "INVALID_STUDENTS":
      return fail("Every student must be on this class arm's roll for the active session, and listed once.", 400, "VALIDATION");
    case "OUTSIDE_SESSION":
      return fail("The attendance date falls outside the academic session.", 400, "OUTSIDE_SESSION");
    case "UNAUTHORIZED":
      return fail("You do not have permission to mark attendance.", 403, "FORBIDDEN");
    default:
      return fail("Attendance operation failed.", 400, "BAD_REQUEST");
  }
}
