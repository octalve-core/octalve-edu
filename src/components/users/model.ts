import type { SelectOption } from "@/components/ui/SelectField";
import { ROLE_LABELS } from "@/lib/roles";

// What the Users page gets from the members/invitations API (plan §0.5.4), and the small display rules around it.

export type RoleName = keyof typeof ROLE_LABELS;
export type PermissionName = "CAN_APPROVE_RESULTS" | "CAN_MANAGE_FINANCE" | "CAN_PUBLISH_CONTENT" | "CAN_MANAGE_USERS";

/// The four extra capabilities (plan §1.7), in the order the API returns them, with a plain-language name and what each one lets a person do.
/// Nobody should ever see "CAN_MANAGE_FINANCE".
export const PERMISSION_OPTIONS: { value: PermissionName; label: string; help: string }[] = [
  { value: "CAN_APPROVE_RESULTS", label: "Approve results", help: "Review and approve teachers' submitted results." },
  { value: "CAN_MANAGE_FINANCE", label: "Manage fees and payments", help: "See invoices and record payments." },
  { value: "CAN_PUBLISH_CONTENT", label: "Publish announcements", help: "Publish content to the school." },
  {
    value: "CAN_MANAGE_USERS",
    label: "Manage people",
    help: "Reserved for managing people; it does not let anyone change roles or permissions.",
  },
];
export const permissionLabel = (permission: PermissionName) => PERMISSION_OPTIONS.find((option) => option.value === permission)!.label;

/// Only staff can be given extra permissions: an administrator already has them all, and a student or parent never does (the server and the
/// database both refuse it; the form simply does not offer it).
export const canHoldPermissions = (role: RoleName) => role === "TEACHING_STAFF" || role === "NON_TEACHING_STAFF";
export type CampusOption = { id: string; name: string };

export type Member = {
  userId: string;
  name: string | null;
  email: string | null;
  role: RoleName;
  campusId: string | null;
  campusName: string | null;
  status: "active" | "deactivated";
  joinedAt: string;
  permissions: PermissionName[];
};

export type Invitation = {
  id: string;
  email: string;
  role: RoleName;
  campusId: string | null;
  campusName: string | null;
  invitedByName: string | null;
  createdAt: string;
  expiresAt: string;
  status: "pending" | "expired";
};

export type PageMeta = { page: number; limit: number; total: number; pages: number; hasNext: boolean };

export const ROLE_OPTIONS: SelectOption[] = (Object.keys(ROLE_LABELS) as RoleName[]).map((role) => ({
  value: role,
  label: ROLE_LABELS[role],
}));

/// Who is using the page: a school administrator, or a campus administrator (one campus, nobody at their own level or above).
export type ActorRole = "ADMIN" | "CAMPUS_ADMIN";
const ADMIN_LEVEL: readonly RoleName[] = ["ADMIN", "CAMPUS_ADMIN"];
/// The roles this person may give: a campus administrator cannot make an administrator or another campus administrator (the API refuses it too).
export const roleOptionsFor = (actor: ActorRole): SelectOption[] =>
  actor === "ADMIN" ? ROLE_OPTIONS : ROLE_OPTIONS.filter((option) => !ADMIN_LEVEL.includes(option.value as RoleName));
/// Whether this person's controls are shown for `member`: a campus administrator does not manage their own level or above.
export const mayManage = (actor: ActorRole, member: Pick<Member, "role">) => actor === "ADMIN" || !ADMIN_LEVEL.includes(member.role);
/// The campus choices for a form: a campus administrator has exactly their own, with no "no campus" option; for the role "campus administrator" a
/// campus is required, so the blank option asks for a choice instead of meaning "none".
export function campusChoices(actor: ActorRole, role: RoleName, campuses: CampusOption[]): SelectOption[] {
  const list = campuses.map((c) => ({ value: c.id, label: c.name }));
  if (actor === "CAMPUS_ADMIN") return list;
  return [{ value: "", label: role === "CAMPUS_ADMIN" ? "Choose a campus" : "No specific campus" }, ...list];
}

export const displayName = (member: Pick<Member, "name" | "email">) => member.name?.trim() || member.email || "Unnamed person";

const UNITS: [string, number][] = [
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/// "Expires in 6 days" · "Expires in 3 hours" · "Expires in 1 minute" · "Expired".
export function expiryText(expiresAt: string, now: number = Date.now()): string {
  const left = new Date(expiresAt).getTime() - now;
  if (left <= 0) return "Expired";
  for (const [unit, size] of UNITS) {
    const count = Math.floor(left / size);
    if (count >= 1) return `Expires in ${count} ${unit}${count === 1 ? "" : "s"}`;
  }
  return "Expires in under a minute";
}
