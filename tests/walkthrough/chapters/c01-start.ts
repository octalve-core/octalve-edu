import { expect, type Page } from "@playwright/test";
import type { Walk } from "../support/walk";
import { PASSWORD, cast, school, setupToken } from "../cast";
import { inbox, openInbox, signIn, unlockInbox } from "./shared";

// C01 Start and sign in, Solo mode (task 0053, task 0033 section 6.6): a visitor on an empty install is sent to the first-run setup, is refused with a wrong token, sets up the school and its first
// administrator, signs in, is refused with a wrong password, signs in, signs out and presses Back, signs in again and unlocks the dev inbox. It ends signed in as the school administrator with the inbox
// unlocked, the state a resumed run (resume.ts) starts every chapter from. The first page load happened before this chapter (Walk.goto); everything after it is a click or a key press.

const chapter = "C01 Start and sign in";

export async function c01Start(walk: Walk, page: Page, theme: "light" | "dark"): Promise<void> {
  await walk.step(
    {
      id: 1,
      chapter,
      role: "Visitor",
      title: "Open the site address",
      caption: "A new, empty install sends a visitor to the first-run setup.",
      covers: ["RTE-01"],
    },
    async () => {
      await expect(page.getByRole("heading", { level: 1, name: "Initialize this instance" })).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 2,
      chapter,
      role: "Visitor",
      title: "Choose the theme",
      caption: "The theme is chosen with the toggle, on the very first screen: the app starts dark and does not follow the system setting.",
      covers: ["SHL-04"],
    },
    async () => {
      await walk.chooseTheme(theme);
    },
  );

  await walk.step(
    {
      id: 3,
      chapter,
      role: "Visitor",
      title: "A wrong setup token is refused",
      caption: "The wizard asks for the deployment's setup token. A wrong one is refused with a sentence and nothing is created.",
      covers: ["SET-03"],
    },
    async () => {
      await walk.type(page.getByLabel("School name"), school.name);
      await walk.type(page.getByLabel("Administrator name"), cast.schoolAdmin.name);
      await walk.type(page.getByLabel("Administrator email"), cast.schoolAdmin.email);
      await walk.type(page.getByLabel("Deployment setup token"), "not-the-setup-token");
      await walk.type(page.getByLabel("Password", { exact: true }), PASSWORD);
      await walk.type(page.getByLabel("Confirm password"), PASSWORD);
      await walk.click(page.getByRole("button", { name: "Complete setup" }));
      await expect(page.getByRole("alert").filter({ hasText: /token/i })).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 4,
      chapter,
      role: "Visitor",
      title: "Create the school and its administrator",
      caption: "With the right token the wizard creates the school and its first administrator, and disables itself.",
      covers: ["SET-01"],
    },
    async () => {
      await walk.type(page.getByLabel("Deployment setup token"), setupToken());
      await walk.click(page.getByRole("button", { name: "Complete setup" }));
      await expect(page.getByRole("heading", { level: 1, name: "Setup complete" })).toBeVisible();
      await walk.click(page.getByRole("button", { name: "Continue to sign in" }));
      await expect(page.getByRole("heading", { level: 1, name: "Sign in to your dashboard" })).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 5,
      chapter,
      role: "Visitor",
      title: "A wrong password is refused",
      caption: "A wrong password is refused with one sentence that does not say whether the account exists.",
      covers: ["LOG-02"],
    },
    async () => {
      await walk.type(page.getByLabel("Email address"), cast.schoolAdmin.email);
      await walk.type(page.getByLabel("Password", { exact: true }), "Not-the-password-1");
      await walk.click(page.getByRole("button", { name: "Sign in" }));
      await expect(page.getByRole("alert").filter({ hasText: /./ })).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 6,
      chapter,
      role: "School administrator",
      title: "Sign in",
      caption: "The right password opens the school: a person with one school goes straight into it.",
      covers: ["LOG-01"],
    },
    async () => {
      await walk.type(page.getByLabel("Password", { exact: true }), PASSWORD);
      await walk.click(page.getByRole("button", { name: "Sign in" }));
      await expect(page).toHaveURL(/\/schools\/[^/]+$/);
      await expect(page.getByRole("heading", { level: 1, name: /^Welcome, Amina/ })).toBeVisible();
    },
  );

  await walk.step(
    {
      id: 7,
      chapter,
      role: "School administrator",
      title: "Sign out, then press Back",
      caption: "Signing out ends the session; the Back button does not show a school page again.",
      covers: ["LOG-04", "LOG-05"],
    },
    async () => {
      await walk.click(page.getByRole("button", { name: /^Account menu for/ }));
      await walk.click(page.getByRole("button", { name: "Sign out" }));
      await expect(page).toHaveURL(/\/login$/);
      await page.goBack();
      await expect(page.getByRole("heading", { level: 1, name: /^Welcome, Amina/ })).toHaveCount(0);
    },
  );

  await walk.step(
    {
      id: 8,
      chapter,
      role: "School administrator",
      title: "Sign in again",
      caption: "Back in, as the school administrator: every chapter that follows starts from here.",
      covers: ["LOG-01"],
    },
    async () => {
      await signIn(walk, page, cast.schoolAdmin);
    },
  );

  await walk.step(
    {
      id: 9,
      chapter,
      role: "School administrator",
      title: "Open the dev email inbox",
      caption:
        "Stand-in for a mailbox: the school's emails land in a local inbox, unlocked with this run's token. Nothing is sent outside this machine.",
      covers: ["SHL-06"],
    },
    async () => {
      await openInbox(walk, page);
      await unlockInbox(walk, page);
      await expect(inbox(page).getByText(/No messages yet/)).toBeVisible();
    },
  );
}
