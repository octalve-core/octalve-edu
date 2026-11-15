import { expect, type Locator, type Page } from "@playwright/test";
import type { Walk } from "../support/walk";
import { PASSWORD, devToolsToken } from "../cast";

// What more than one chapter does the same way: sign in, sign out, open a page from the sidebar and use the dev email inbox. A person does exactly these things with the mouse and keyboard, so the
// helpers use the walk's own click and type and nothing else.

export const mainNav = (page: Page) => page.getByRole("navigation", { name: "Main" });

/// A person who belongs to ONE school goes straight into it (the dashboard redirects to `/schools/<code>`); a person in several, or in none, stops at the dashboard (`/dashboard`). Both greet them by their
/// first name, so the helper reads that and not the address.
export async function signIn(walk: Walk, page: Page, person: { name: string; email: string }): Promise<void> {
  await walk.type(page.getByLabel("Email address"), person.email);
  await walk.type(page.getByLabel("Password", { exact: true }), PASSWORD);
  await walk.click(page.getByRole("button", { name: "Sign in" }));
  await expect(page.getByRole("heading", { level: 1, name: `Welcome, ${person.name.split(" ")[0]}` })).toBeVisible();
}

export async function signOut(walk: Walk, page: Page): Promise<void> {
  await walk.click(page.getByRole("button", { name: /^Account menu for/ }));
  await walk.click(page.getByRole("button", { name: "Sign out", exact: true }));
  await expect(page).toHaveURL(/\/login$/);
}

/// Opens a page by clicking its sidebar entry and reads that its heading is there. The heading is the page's own title, which is not always the entry's name ("Academics" opens "Academic setup").
export async function openPage(walk: Walk, page: Page, entry: string, heading: string = entry): Promise<void> {
  await walk.click(mainNav(page).getByRole("link", { name: entry, exact: true }));
  await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
}

export const inbox = (page: Page) => page.getByRole("dialog", { name: "Dev email inbox" });

/// Opens the dev inbox from its launcher (the envelope at the bottom right of every page).
export async function openInbox(walk: Walk, page: Page): Promise<void> {
  await walk.click(page.getByRole("button", { name: /^Dev email inbox/ }).first());
  await expect(inbox(page)).toBeVisible();
}

/// The first time on a tab the inbox asks for the run's token; after that the tab keeps it. C01 does this in a whole run and the resume does it in a resumed one, so no later chapter has to.
export async function unlockInbox(walk: Walk, page: Page): Promise<void> {
  await walk.type(inbox(page).getByLabel("Dev tools token"), devToolsToken());
  await walk.click(inbox(page).getByRole("button", { name: "Unlock" }));
}

/// Opens the message sent to `email` and follows the link in it, as a person would: a click on the link the inbox shows.
export async function followInvitation(walk: Walk, page: Page, email: string): Promise<void> {
  await walk.click(inbox(page).getByRole("button", { name: new RegExp(`${email}.*invited`) }));
  await expect(inbox(page).getByText(`To ${email}`)).toBeVisible();
  await walk.click(inbox(page).getByRole("link", { name: /\/accept-invite#token=/ }));
}

/// The page's own dialog, the notice a save leaves ("Saved ..."), a row of a list by its words, and a field of a form by its label: the same four in every setup screen.
export const dialogOf = (page: Page) => page.getByRole("dialog");
export const notice = (page: Page) =>
  page
    .getByRole("status")
    .filter({ hasText: /\S/ })
    .filter({ hasNotText: /^Loading/ });
export const item = (page: Page, text: string | RegExp) => page.getByRole("listitem").filter({ hasText: text });
export const field = (scope: Locator, label: string) => scope.getByLabel(label, { exact: true });

// The invitation round every chapter that brings a new person in repeats: the dialog on the Users page (an address, a role, optionally a campus), and the person's side of it (the link in the dev inbox,
// a name and a password).
export const pendingFor = (page: Page, email: string) => page.getByRole("button", { name: `Revoke the invitation to ${email}` });

export const inviteDialog = (page: Page) => page.getByRole("dialog", { name: "Invite someone" });

/// Opens the invitation dialog and fills in the address and the role; the campus is chosen (or not) by the caller, then `send` finishes it.
export async function startInvite(walk: Walk, page: Page, email: string, role: string): Promise<void> {
  await walk.click(page.getByRole("button", { name: "Invite someone" }));
  await walk.type(inviteDialog(page).getByLabel("Email address"), email);
  await walk.selectOption(inviteDialog(page).getByLabel("Role", { exact: true }), role);
}

export async function send(walk: Walk, page: Page, email: string): Promise<void> {
  await walk.click(inviteDialog(page).getByRole("button", { name: "Send invitation" }));
  await expect(page.getByText(`Invitation sent to ${email}. The link works for 7 days.`)).toBeVisible();
  await expect(pendingFor(page, email)).toBeVisible();
}

/// A person who belongs to one campus: the address, the role and the campus.
export async function inviteAt(walk: Walk, page: Page, email: string, role: string, campus: string): Promise<void> {
  await startInvite(walk, page, email, role);
  await walk.selectOption(inviteDialog(page).getByLabel("Campus", { exact: true }), campus);
  await send(walk, page, email);
}

export async function accept(walk: Walk, page: Page, person: { name: string; email: string }, roleText: string): Promise<void> {
  await openInbox(walk, page);
  await followInvitation(walk, page, person.email);
  await expect(page.getByText(roleText).first()).toBeVisible();
  await walk.type(page.getByLabel("Your name"), person.name);
  await walk.type(page.getByLabel("Password", { exact: true }), PASSWORD);
  await walk.type(page.getByLabel("Confirm password"), PASSWORD);
  await walk.click(page.getByRole("button", { name: "Create account and join" }));
  await walk.click(page.getByRole("button", { name: "Continue to sign in" }));
  await expect(page).toHaveURL(/\/login$/);
}
