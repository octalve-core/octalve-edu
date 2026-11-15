import { expect, type Page } from "@playwright/test";
import type { Walk } from "../support/walk";
import { cast, school } from "../cast";
import { accept, followInvitation, inbox, inviteAt, mainNav, openInbox, pendingFor, send, signIn, signOut, startInvite } from "./shared";

// C03 Users and sign-ins (task 0053, task 0033 section 6.6): the school administrator opens Users, invites a campus administrator, a teacher and a member of the non-teaching staff, invites one
// address that was mistyped and revokes it. The people accept through the dev inbox, and the chapter then signs in as each of them and visits every page the person's sidebar offers, so that what each
// kind of person can and cannot reach is shown, not claimed. It ends signed in as the school administrator again (the state every chapter starts from).

const chapter = "C03 Users and sign-ins";

// Each page a person reaches from the sidebar: the entry's name and the heading of the page it opens.
const PAGE_HEADINGS: Record<string, string> = {
  Academics: "Academic setup",
  People: "People",
  Finance: "Finance",
  Results: "Results",
  Communication: "Communication",
  Users: "Users",
  "Question bank": "Question bank",
  Forms: "Forms",
  Programs: "Programs",
  Settings: "Settings",
};

/// Clicks each of the entries the role may use, in turn, and reads the page it lands on: the right heading and the entry marked as the current page. Then the sidebar has exactly those entries
/// (and Overview), so nothing else is offered.
async function sweep(walk: Walk, page: Page, entries: readonly string[]): Promise<void> {
  for (const entry of entries) {
    await walk.click(mainNav(page).getByRole("link", { name: entry, exact: true }));
    await expect(page.getByRole("heading", { level: 1, name: PAGE_HEADINGS[entry] })).toBeVisible();
    await expect(mainNav(page).getByRole("link", { name: entry, exact: true })).toHaveAttribute("aria-current", "page");
  }
  await expect(mainNav(page).getByRole("link")).toHaveCount(entries.length + 1);
}

const CAMPUS_ADMIN_ENTRIES = [
  "Academics",
  "People",
  "Finance",
  "Results",
  "Communication",
  "Users",
  "Question bank",
  "Forms",
  "Programs",
] as const;
const STAFF_ENTRIES = ["Academics", "People", "Results", "Question bank", "Forms", "Programs"] as const;

export async function c03Users(walk: Walk, page: Page): Promise<void> {
  await walk.step(
    {
      id: 22,
      chapter,
      role: "School administrator",
      title: "Open Users",
      caption: "Users lists the people with a role in the school, with filters, and the invitations that are still open.",
      covers: ["USR-01"],
    },
    async () => {
      await page.keyboard.press("Escape");
      await walk.click(mainNav(page).getByRole("link", { name: "Users", exact: true }));
      await expect(page.getByRole("heading", { level: 1, name: "Users" })).toBeVisible();
      await expect(page.getByRole("heading", { level: 2, name: "People" })).toBeVisible();
      await expect(page.getByRole("region", { name: "People" }).getByText(cast.schoolAdmin.email)).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 23,
      chapter,
      role: "School administrator",
      title: "Invite a campus administrator",
      caption: "An invitation is an email address, a role and a campus. A campus administrator runs one campus, so the campus is required.",
      covers: ["USR-02"],
    },
    async () => {
      await inviteAt(walk, page, cast.campusAdmin.email, "Campus administrator", school.campuses.north);
    },
  );

  await walk.step(
    {
      id: 24,
      chapter,
      role: "School administrator",
      title: "Invite a teacher",
      caption: "A teacher belongs to one campus.",
      covers: ["USR-02"],
    },
    async () => {
      await inviteAt(walk, page, cast.teacher.email, "Teaching staff", school.campuses.north);
    },
  );

  await walk.step(
    {
      id: 25,
      chapter,
      role: "School administrator",
      title: "Invite a member of the non-teaching staff",
      caption: "Non-teaching staff see only what their work needs.",
      covers: ["USR-02"],
    },
    async () => {
      await inviteAt(walk, page, cast.staff.email, "Non-teaching staff", school.campuses.north);
    },
  );

  await walk.step(
    {
      id: 26,
      chapter,
      role: "School administrator",
      title: "Revoke an invitation sent to a mistyped address",
      caption: "Revoke ends an open invitation; its link stops working.",
      covers: ["USR-03"],
    },
    async () => {
      await startInvite(walk, page, cast.mistyped.email, "Administrator");
      await send(walk, page, cast.mistyped.email);
      await walk.click(pendingFor(page, cast.mistyped.email));
      await expect(page.getByText(`The invitation to ${cast.mistyped.email} was revoked. Its link no longer works.`)).toBeVisible();
      await expect(pendingFor(page, cast.mistyped.email)).toHaveCount(0);
      await expect(pendingFor(page, cast.campusAdmin.email)).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 27,
      chapter,
      role: "School administrator",
      title: "Sign out",
      caption: "The invited people open their own invitations, so the school administrator signs out first.",
      covers: ["LOG-04"],
    },
    async () => {
      await signOut(walk, page);
    },
  );

  await walk.step(
    {
      id: 28,
      chapter,
      role: "Visitor",
      title: "The invitations are in the dev inbox",
      caption: "Each invitation is an email with a link. Nothing is sent outside this machine: the inbox stands in for the mailboxes.",
      covers: ["SHL-06"],
    },
    async () => {
      await openInbox(walk, page);
      await expect(inbox(page).getByRole("button", { name: new RegExp(`${cast.campusAdmin.email}.*invited`) })).toBeVisible();
      await expect(inbox(page).getByRole("button", { name: new RegExp(`${cast.teacher.email}.*invited`) })).toBeVisible();
      await expect(inbox(page).getByRole("button", { name: new RegExp(`${cast.staff.email}.*invited`) })).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 29,
      chapter,
      role: "Visitor",
      title: "A revoked invitation's link is refused",
      caption: "The message to the mistyped address is still in the inbox; its link no longer works, and says what to do.",
      covers: ["INV-02"],
    },
    async () => {
      await followInvitation(walk, page, cast.mistyped.email);
      await expect(page.getByText("Ask your school administrator to send a new invitation.")).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 30,
      chapter,
      role: "Campus administrator",
      title: "Accept the campus administrator's invitation",
      caption: "The link shows the school and the role; the person chooses a name and a password.",
      covers: ["INV-01"],
    },
    async () => {
      await page.goBack();
      await accept(walk, page, cast.campusAdmin, "Campus administrator");
    },
  );

  await walk.step(
    {
      id: 31,
      chapter,
      role: "Teacher",
      title: "Accept the teacher's invitation",
      caption: "The same steps for a teacher.",
      covers: ["INV-01"],
    },
    async () => {
      await accept(walk, page, cast.teacher, "Teaching staff");
    },
  );

  await walk.step(
    {
      id: 32,
      chapter,
      role: "Non-teaching staff",
      title: "Accept the non-teaching staff member's invitation",
      caption: "And for a member of the non-teaching staff.",
      covers: ["INV-01"],
    },
    async () => {
      await accept(walk, page, cast.staff, "Non-teaching staff");
    },
  );

  await walk.step(
    {
      id: 33,
      chapter,
      role: "Campus administrator",
      title: "Sign in as the campus administrator",
      caption: "The account menu says who is signed in. The overview shows the one campus this person runs.",
      covers: ["LOG-01", "SHL-07"],
    },
    async () => {
      await signIn(walk, page, cast.campusAdmin);
      await expect(page.getByRole("heading", { level: 3, name: "Your campus" })).toBeVisible();
      await expect(page.getByRole("listitem").filter({ hasText: school.campuses.north })).toBeVisible();
      await walk.click(page.getByRole("button", { name: /^Account menu for/ }));
      await expect(page.getByText(cast.campusAdmin.email).first()).toBeVisible();
      await expect(page.getByRole("link", { name: "Profile" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Video guide" })).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 34,
      chapter,
      role: "Campus administrator",
      title: "Visit every page the campus administrator may use",
      caption:
        "Every sidebar entry opens its page. Settings is not offered: the school's configuration and its campuses belong to the school administrator.",
      covers: ["SHL-01", "SHL-02"],
    },
    async () => {
      await page.keyboard.press("Escape");
      await sweep(walk, page, CAMPUS_ADMIN_ENTRIES);
      await expect(mainNav(page).getByRole("link", { name: "Settings", exact: true })).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 35,
      chapter,
      role: "Teacher",
      title: "Sign in as the teacher and visit every page",
      caption:
        "A teacher sees the school year and its people, results and the question bank, forms and programs: no finance, no users, no settings.",
      covers: ["LOG-01", "SHL-01", "SHL-02"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.teacher);
      await sweep(walk, page, STAFF_ENTRIES);
      await expect(mainNav(page).getByRole("link", { name: "Finance", exact: true })).toHaveCount(0);
      await expect(mainNav(page).getByRole("link", { name: "Users", exact: true })).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 36,
      chapter,
      role: "Non-teaching staff",
      title: "Sign in as the non-teaching staff member and visit every page",
      caption: "The same entries as a teacher; what each may do on a page is decided on the page.",
      covers: ["LOG-01", "SHL-01", "SHL-02"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.staff);
      await sweep(walk, page, STAFF_ENTRIES);
    },
  );

  await walk.step(
    {
      id: 37,
      chapter,
      role: "School administrator",
      title: "Back to the school administrator: the four people are active",
      caption: "Everyone who accepted is listed, with a role and a campus, and the administrator can deactivate each of the three.",
      covers: ["USR-01"],
    },
    async () => {
      await signOut(walk, page);
      await signIn(walk, page, cast.schoolAdmin);
      await walk.click(mainNav(page).getByRole("link", { name: "Users", exact: true }));
      await expect(page.getByRole("heading", { level: 1, name: "Users" })).toBeVisible();
      const people = page.getByRole("region", { name: "People" });
      await expect(people.getByText(cast.campusAdmin.email)).toBeVisible();
      await expect(people.getByText(cast.teacher.email)).toBeVisible();
      await expect(people.getByText(cast.staff.email)).toBeVisible();
      await expect(people.getByRole("button", { name: /^Deactivate / })).toHaveCount(3);
    },
  );
}
