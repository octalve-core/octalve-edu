import type { Role } from "@prisma/client";

/// Human-readable role names for display. The enum values are storage/
/// authorization identifiers; nobody should ever see "NON_TEACHING_STAFF".
export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrator",
  TEACHING_STAFF: "Teaching staff",
  NON_TEACHING_STAFF: "Non-teaching staff",
  STUDENT: "Student",
  PARENT: "Parent",
};
