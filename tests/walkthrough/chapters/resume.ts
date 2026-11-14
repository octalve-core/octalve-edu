import { expect, type Page } from "@playwright/test";
import type { Walk } from "../support/walk";
import { cast } from "../cast";
import { inbox, openInbox, signIn, unlockInbox } from "./shared";

// The start of a RESUMED recon (task 0033, section 6.6 and 6.16): the database was restored from a checkpoint, so the instance is set up and the browser is new. Like a person coming back to the
// school's address, the walk is on the front page (its one landing), chooses the theme, presses Sign in, signs in as the school administrator and unlocks the dev inbox with the run's token, as C01's
// last steps do in a whole run, so that a chapter can open the inbox the same way whether or not the chapters before it ran. It is not a chapter of the journey: no steps, nothing in the timeline,
// and it runs only when WALKTHROUGH_ONLY is set. Every chapter ends signed in as the school administrator and begins by closing whatever is open (Escape), so a chapter starts the same way after a
// whole run and after this.

export async function resume(walk: Walk, page: Page, theme: "light" | "dark"): Promise<void> {
  await walk.click(page.getByRole("link", { name: "Sign in" }).first());
  await expect(page.getByRole("heading", { level: 1, name: "Sign in to your dashboard" })).toBeVisible();
  await walk.chooseTheme(theme);
  await signIn(walk, page, cast.schoolAdmin);
  await openInbox(walk, page);
  await unlockInbox(walk, page);
  await page.keyboard.press("Escape");
  await expect(inbox(page)).toBeHidden();
}
