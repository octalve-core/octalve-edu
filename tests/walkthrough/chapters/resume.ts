import { expect, type Page } from "@playwright/test";
import type { Walk } from "../support/walk";
import { cast } from "../cast";
import { signIn } from "./shared";

// The start of a RESUMED recon (task 0033, section 6.16): the database was restored from a checkpoint, so the instance is set up and the browser is new. Like a person coming back to the school's
// address, the walk is on the front page (its one landing), chooses the theme, presses Sign in and signs in as the school administrator. It is not a chapter of the journey: no steps, nothing in the
// timeline, and it runs only when WALKTHROUGH_ONLY is set. The chapter that follows begins by signing out.

export async function resume(walk: Walk, page: Page, theme: "light" | "dark"): Promise<void> {
  await walk.click(page.getByRole("link", { name: "Sign in" }).first());
  await expect(page.getByRole("heading", { level: 1, name: "Sign in to your dashboard" })).toBeVisible();
  await walk.chooseTheme(theme);
  await signIn(walk, page, cast.schoolAdmin);
}
