import { expect, type Page } from "@playwright/test";
import type { Walk } from "../support/walk";
import { PASSWORD } from "../cast";

// What more than one chapter does the same way: sign in, sign out and open a page from the sidebar. A person does exactly these things with the mouse and keyboard, so the helpers use the
// walk's own click and type and nothing else.

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

/// Opens a page by clicking its sidebar entry and reads that its heading is there. The heading is the page's own title, which is not always the entry's name ("Coursework" opens
/// "Coursework & LMS").
export async function openPage(walk: Walk, page: Page, entry: string, heading: string = entry): Promise<void> {
  await walk.click(mainNav(page).getByRole("link", { name: entry, exact: true }));
  await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
}
