import type { Page } from "@playwright/test";
import { expect } from "../support/fixtures";

/// Alerts in the page's <main>. Next.js also renders its own (empty)
/// `<next-route-announcer role="alert">` outside <main>, so a bare
/// getByRole("alert") is ambiguous.
export const alerts = (page: Page) => page.getByRole("main").getByRole("alert");

/// The alert containing `text` (a page can show several, e.g. the HTTP warning plus an error).
export const alertWith = (page: Page, text: string | RegExp) => alerts(page).filter({ hasText: text });

export const emailField = (page: Page) => page.getByLabel("Email address", { exact: true });
export const passwordField = (page: Page) => page.getByLabel("Password", { exact: true });
export const signInButton = (page: Page) => page.getByRole("button", { name: "Sign in", exact: true });

export async function fillCredentials(page: Page, email: string, password: string) {
  await emailField(page).fill(email);
  await passwordField(page).fill(password);
}

export async function signInThroughUi(page: Page, user: { email: string; password: string }) {
  await page.goto("/login");
  await fillCredentials(page, user.email, user.password);
  await signInButton(page).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

/// Requests the page makes to the login API, for "did it send anything?" checks.
export function trackLoginRequests(page: Page) {
  const requests: string[] = [];
  page.on("request", (req) => {
    if (req.url().endsWith("/api/v1/auth/login")) requests.push(req.method());
  });
  return requests;
}
