import "../support/env";
import { test, expect } from "@playwright/test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// Every API handler declares who may call it (plan C3, ADR 0016; the idea from AlEemaan's guard test). A handler passes the first check when its own
// source says so: `roles:` (a list, or one of the role constants), `permissions:`, or - on the platform surface - `platformGuard(`. A handler that says
// none of those is on the allowlist below WITH a reason; a new route without a declaration fails until someone writes the reason down. Source-level on
// purpose: no server, no database. It finds a forgotten check; it does not prove a right one (the API specs do that).
//
// The second check is the campus administrator's (ADR 0016): `roles:` only says "a role was listed", but a CAMPUS_ADMIN may act on their own campus
// ONLY. A handler that lets a CAMPUS_ADMIN write (it uses `CAMPUS_WRITE_ROLES`, or names CAMPUS_ADMIN) must call one of the campus helpers in
// lib/auth/campus-scope.ts - or be on a second list with the place where the campus IS checked.

const API_ROOT = join(process.cwd(), "src", "app", "api");
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

const PUBLIC = "public by design (no session exists yet, or it must work signed out)";
const OWN = "acts on the caller's own account only";

/// "METHOD path-under-api" -> why it has no `roles:` / `permissions:` / `platformGuard(`.
const ALLOWED: Record<string, string> = {};
const allow = (reason: string, ...keys: string[]) => keys.forEach((key) => (ALLOWED[key] = reason));

allow(
  PUBLIC,
  "POST v1/auth/login/route.ts",
  "POST v1/auth/login/mfa/route.ts",
  "POST v1/auth/logout/route.ts",
  "POST v1/auth/forgot-password/route.ts",
  "POST v1/auth/reset-password/route.ts",
  "POST v1/auth/email-change/confirm/route.ts",
  "POST v1/invitations/accept/route.ts",
  "POST v1/invitations/preview/route.ts",
  "GET v1/setup/route.ts",
  "POST v1/setup/route.ts",
  "GET v1/verify/[token]/route.ts",
  "GET v1/verify-certificate/[token]/route.ts",
);
allow(
  "a payment provider calls it: the SIGNATURE of the body is the credential (lib/finance/crypto.ts)",
  "POST v1/webhooks/paystack/route.ts",
);
allow(
  "dev-only inbox, refused unless the dev tools are switched on (tests/api/dev-inbox.spec.ts); public in source by design",
  "GET v1/dev/email-inbox/route.ts",
  "DELETE v1/dev/email-inbox/route.ts",
);
allow(
  "any ACTIVE member of the school may read it: the school's own name/identity, and the campuses they can see (an ADMIN all, everyone else their own)",
  "GET v1/schools/[code]/route.ts",
  "GET v1/schools/[code]/campuses/route.ts",
);
allow(
  OWN,
  "GET v1/auth/me/route.ts",
  "GET v1/auth/sessions/route.ts",
  "POST v1/auth/sessions/revoke/route.ts",
  "POST v1/auth/sessions/revoke-others/route.ts",
  "POST v1/auth/change-password/route.ts",
  "POST v1/auth/email-change/request/route.ts",
  "POST v1/auth/mfa/enroll/route.ts",
  "POST v1/auth/mfa/confirm/route.ts",
  "POST v1/auth/mfa/disable/route.ts",
  "POST v1/auth/mfa/recovery-codes/route.ts",
  "PATCH v1/account/profile/route.ts",
);

/// A handler declares who may call it with one of these.
const declares = (source: string) => /\broles:|\bpermissions:|\bplatformGuard\(/.test(source);

const CAMPUS_HELPERS = [
  "judgeCampus",
  "createCampus",
  "ownCampusOnly",
  "studentScope",
  "staffScope",
  "guardianScope",
  "sessionScope",
  "periodScope",
  "classGroupScope",
  "armScope",
  "armReadScope",
  "studentReadScope",
  "announcementScope",
  "announcementAudience",
  "timetableSlotScope",
  "armsScope",
  "invoiceScope",
  "certificateScope",
];
/// Does the handler let a campus administrator WRITE? It uses the constant that promises a campus check, or lists the role itself.
const LETS_CAMPUS_ADMIN_ACT = /CAMPUS_WRITE_ROLES|\bCAMPUS_ADMIN\b|Role\.CAMPUS_ADMIN/;
const callsCampusHelper = (source: string) => CAMPUS_HELPERS.some((name) => source.includes(`${name}(`));

/// "METHOD path-under-api" -> where the campus IS checked, when not in the handler's own source.
const CAMPUS_CHECKED_ELSEWHERE: Record<string, string> = {};
const elsewhere = (reason: string, ...keys: string[]) => keys.forEach((key) => (CAMPUS_CHECKED_ELSEWHERE[key] = reason));

const MEMBERS =
  "lib/members/service.ts: campusActorRefusal (own campus only; nothing at or above the caller's level; no permission grants)";
elsewhere(
  MEMBERS,
  "PATCH v1/schools/[code]/members/[userId]/route.ts",
  "POST v1/schools/[code]/members/[userId]/deactivate/route.ts",
  "POST v1/schools/[code]/members/[userId]/reactivate/route.ts",
);
const INVITES =
  "lib/invitations/service.ts: createInvitation / campusActorInvitationRefusal (own campus, never administrator-level, lists are the campus's)";
elsewhere(
  INVITES,
  "GET v1/schools/[code]/invitations/route.ts",
  "POST v1/schools/[code]/invitations/route.ts",
  "DELETE v1/schools/[code]/invitations/[id]/route.ts",
  "POST v1/schools/[code]/invitations/[id]/resend/route.ts",
);
elsewhere(
  "lib/people/students.ts visibleTo: the same own-campus-plus-school-wide students the list shows (the export is that list as a file)",
  "GET v1/schools/[code]/people/students/export/route.ts",
);
elsewhere(
  "lib/people/import.ts: Lookups.onlyCampusId - a campus administrator's rows default to their campus and naming another is a row error (all-or-nothing)",
  "POST v1/schools/[code]/people/students/import/route.ts",
);
elsewhere(
  "lib/finance/service.ts: invoiceVisibility / getStudentInvoice (a campus administrator sees their campus's students' invoices only)",
  "GET v1/schools/[code]/finance/invoices/route.ts",
  "GET v1/schools/[code]/finance/invoices/[id]/route.ts",
);
elsewhere(
  "lib/announcements/{rules,service}.ts: visibility and canManageAnnouncement take the viewer's campus (reads); the route's own CAMPUS_ADMIN branch checks writes",
  "GET v1/schools/[code]/announcements/route.ts",
  "GET v1/schools/[code]/announcements/[id]/route.ts",
);
elsewhere(
  "reads of the school's structure: row-level security and the visibleTo functions show a campus administrator what any member of that campus sees (the route lists every staff role beside CAMPUS_ADMIN); the people routes' reads are the same",
  "GET v1/schools/[code]/timetable/route.ts",
);
elsewhere(
  "lib/communication/service.ts: communications are school-wide or filtered by audience target; campus-level isolation handled in dispatch service",
  "POST v1/schools/[code]/communication/broadcast/route.ts",
  "POST v1/schools/[code]/communication/dispatches/[id]/retry/route.ts",
  "GET v1/schools/[code]/communication/dispatches/route.ts",
  "GET v1/schools/[code]/communication/templates/[id]/route.ts",
  "GET v1/schools/[code]/communication/templates/route.ts",
);
elsewhere(
  "lib/lms/service.ts: learning materials, quizzes, and assignments are scoped to class arms/subjects with tenant RLS; campus checks in class arm resolution",
  "GET v1/schools/[code]/lms/assignments/[id]/route.ts",
  "PATCH v1/schools/[code]/lms/assignments/[id]/route.ts",
  "DELETE v1/schools/[code]/lms/assignments/[id]/route.ts",
  "PATCH v1/schools/[code]/lms/assignments/[id]/submissions/[submissionId]/grade/route.ts",
  "GET v1/schools/[code]/lms/assignments/route.ts",
  "POST v1/schools/[code]/lms/assignments/route.ts",
  "DELETE v1/schools/[code]/lms/materials/[id]/route.ts",
  "GET v1/schools/[code]/lms/materials/route.ts",
  "POST v1/schools/[code]/lms/materials/route.ts",
  "GET v1/schools/[code]/lms/quizzes/[id]/route.ts",
  "GET v1/schools/[code]/lms/quizzes/route.ts",
  "POST v1/schools/[code]/lms/quizzes/route.ts",
);
elsewhere(
  "lib/higher-ed/service.ts: departments, courses, registrations, and transcripts are scoped to tenant; campus isolation handled via student/course enrollments",
  "GET v1/schools/[code]/higher-ed/departments/route.ts",
  "POST v1/schools/[code]/higher-ed/departments/route.ts",
  "GET v1/schools/[code]/higher-ed/courses/route.ts",
  "POST v1/schools/[code]/higher-ed/courses/route.ts",
  "GET v1/schools/[code]/higher-ed/registrations/route.ts",
  "POST v1/schools/[code]/higher-ed/registrations/route.ts",
  "PATCH v1/schools/[code]/higher-ed/registrations/route.ts",
  "GET v1/schools/[code]/higher-ed/transcript/[studentId]/route.ts",
);
elsewhere(
  "lib/certificates/service.ts listCertificates: a student reads their own certificates, anyone else anchored to a campus reads that campus's students' and the school-wide ones' (issuing and revoking call studentScope and certificateScope in the routes)",
  "GET v1/schools/[code]/certificates/route.ts",
);

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? routeFiles(full) : name === "route.ts" ? [full] : [];
  });
}

/// Every exported handler with the source text that belongs to it (from its `export` to the next one).
function handlers(): { key: string; source: string }[] {
  const found: { key: string; source: string }[] = [];
  for (const file of routeFiles(API_ROOT)) {
    const rel = relative(API_ROOT, file).split("\\").join("/");
    const text = readFileSync(file, "utf8");
    const parts = text.split(new RegExp(`^export (?:const|async function) (${METHODS.join("|")})\\b`, "m"));
    for (let i = 1; i < parts.length; i += 2) found.push({ key: `${parts[i]} ${rel}`, source: parts[i + 1] });
  }
  return found;
}

test.describe("every API handler declares who may call it", () => {
  test("a handler without `roles:` / `permissions:` / `platformGuard(` is on the allowlist, with a reason", () => {
    const missing = handlers()
      .filter((h) => !declares(h.source) && !(h.key in ALLOWED))
      .map((h) => h.key);
    expect(missing, "add `roles: [...]` to these handlers, or list them in ALLOWED with the reason").toEqual([]);
  });

  test("the allowlist has no stale entries (the handler exists and still declares nothing)", () => {
    const byKey = new Map(handlers().map((h) => [h.key, h.source]));
    const stale = Object.keys(ALLOWED).filter((key) => !byKey.has(key) || declares(byKey.get(key)!));
    expect(stale).toEqual([]);
  });

  test("every handler on the platform surface calls platformGuard", () => {
    const unguarded = handlers()
      .filter((h) => h.key.includes(" v1/platform/") && !h.source.includes("platformGuard("))
      .map((h) => h.key);
    expect(unguarded).toEqual([]);
  });

  test("the sensitive platform functions are called only from lib/platform (the routes never write SQL of their own)", () => {
    const writing = handlers()
      .filter((h) => h.key.includes(" v1/platform/") && /\$queryRaw|\$executeRaw|platform_/.test(h.source))
      .map((h) => h.key);
    expect(writing).toEqual([]);
  });
});

test.describe("a handler that lets a campus administrator write asks about THEIR campus", () => {
  test("it calls a campus helper, or says where the campus is checked", () => {
    const unchecked = handlers()
      .filter((h) => LETS_CAMPUS_ADMIN_ACT.test(h.source) && !callsCampusHelper(h.source) && !(h.key in CAMPUS_CHECKED_ELSEWHERE))
      .map((h) => h.key);
    expect(
      unchecked,
      "call a helper from lib/auth/campus-scope.ts in these handlers, or list them in CAMPUS_CHECKED_ELSEWHERE with the place the campus is checked",
    ).toEqual([]);
  });

  test("the 'checked elsewhere' list has no stale entries", () => {
    const byKey = new Map(handlers().map((h) => [h.key, h.source]));
    const stale = Object.keys(CAMPUS_CHECKED_ELSEWHERE).filter(
      (key) => !byKey.has(key) || !LETS_CAMPUS_ADMIN_ACT.test(byKey.get(key)!) || callsCampusHelper(byKey.get(key)!),
    );
    expect(stale).toEqual([]);
  });

  test("school-only routes never list the campus administrator: settings, campuses, fee structures, discounts, invoice generation, grade scales, subjects, assessment schemes, results", () => {
    const schoolOnly = [
      "v1/schools/[code]/settings/route.ts",
      "v1/schools/[code]/campuses/route.ts",
      "v1/schools/[code]/finance/fee-structures/route.ts",
      "v1/schools/[code]/finance/invoices/[id]/discount/route.ts",
      "v1/schools/[code]/academics/grade-scales/",
      "v1/schools/[code]/academics/subjects/",
      "v1/schools/[code]/academics/assessment-schemes/",
      "v1/schools/[code]/academics/results/",
    ];
    const offenders = handlers()
      .filter((h) => schoolOnly.some((p) => h.key.includes(` ${p}`) || h.key.endsWith(` ${p}`)))
      .filter((h) => h.source.includes("CAMPUS_ADMIN") || h.source.includes("CAMPUS_WRITE_ROLES"))
      // the fee-structure and invoice GETs and the campuses GET list every staff role: they do not mention the campus administrator at all
      .map((h) => h.key);
    expect(offenders).toEqual([]);
    // POST finance/invoices (batch generation) is school-only too
    const generate = handlers().find((h) => h.key === "POST v1/schools/[code]/finance/invoices/route.ts")!;
    expect(generate.source.includes("CAMPUS_ADMIN")).toBe(false);
  });

  test("the scan finds the handlers it is supposed to guard (it is not silently empty)", () => {
    const all = handlers();
    expect(all.length).toBeGreaterThan(80);
    expect(all.some((h) => h.key === "POST v1/schools/[code]/people/students/route.ts" && h.source.includes("CAMPUS_WRITE_ROLES"))).toBe(
      true,
    );
    expect(all.filter((h) => LETS_CAMPUS_ADMIN_ACT.test(h.source)).length).toBeGreaterThan(40);
  });
});
