import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { seedInstance } from "../support/db";
import { brand } from "@/lib/brand";
import { currentTheme, setTheme } from "../support/theme";

// The product logo on the signed-out screens is a link to the start page, `/` (AuthShell). Runs on the desktop AND the phone project: the logo is in the brand panel on large screens and in
// the compact header on phones, and never both at once.
//
// What `/` shows is the landing page's business (tests/e2e/landing-screens.spec.ts); this spec pins that the logo is a real link to it, that a keyboard reaches it, that it is announced, and that making it a link did not expose the panel's decorative parts to assistive technology.

test.beforeAll(async () => {
  await seedInstance();
});

const SCREENS = ["/login", "/forgot-password"];
const logo = (page: Page) => page.getByRole("link", { name: brand.name, exact: true });

test("on a signed-out screen there is exactly one logo link, to /, in the brand panel on a large screen and in the header on a phone", async ({
  page,
  isMobile,
}) => {
  for (const screen of SCREENS) {
    await page.goto(screen);
    await expect(logo(page), screen).toHaveCount(1);
    await expect(logo(page), screen).toBeVisible();
    await expect(logo(page), screen).toHaveAttribute("href", "/");
    const where = isMobile ? page.getByRole("main") : page.locator("aside");
    await expect(where.getByRole("link", { name: brand.name, exact: true }), screen).toBeVisible();
  }
});

test("a keyboard reaches the logo, and it shows a focus ring", async ({ page }) => {
  await page.goto("/forgot-password");
  // The first field has the caret when the page opens (autofocus), so Tab starts in the middle of the page: field, button, link, then round to the top. The logo is the first stop after that on a
  // large screen and comes after the theme button on a phone. A whole trip round the page is the claim: a keyboard reaches the logo.
  let focused = false;
  for (let presses = 0; presses < 8 && !focused; presses += 1) {
    await page.keyboard.press("Tab");
    focused = await logo(page).evaluate((el) => el === document.activeElement);
  }
  expect(focused, "a full trip of Tab presses round the page reaches the logo").toBe(true);
  const ring = await logo(page).evaluate((el) => {
    const style = getComputedStyle(el);
    return { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) };
  });
  expect(ring.style).not.toBe("none");
  expect(ring.width).toBeGreaterThanOrEqual(2);
});

test("from another signed-out screen the logo takes the visitor back to the start, which for a signed-out visitor is the landing page, one press from sign-in", async ({
  page,
}) => {
  await page.goto("/forgot-password");
  await logo(page).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1, name: brand.landing.headline })).toBeVisible();
  await page.getByRole("main").getByRole("link", { name: "Sign in", exact: true }).first().click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("the panel's headline, blurb, points and copyright are still hidden from assistive technology, and the panel is not a landmark that holds one link", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "the panel only exists from 1024 px up");
  await page.goto("/login");
  await expect(page.locator("aside")).toBeVisible();
  await expect(page.getByRole("complementary")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 2 })).toHaveCount(0); // the panel's headline is an h2; it stays decorative
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
});

test("the logo passes the accessibility rules in both themes, and the page does not scroll sideways", async ({ page }) => {
  for (const screen of SCREENS) {
    await page.goto(screen);
    const initial = await currentTheme(page);
    for (const theme of ["dark", "light"]) {
      await setTheme(page, theme);
      await page.waitForTimeout(250); // the theme fades for 150 ms: a scan inside it measures a colour between the two
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
      expect(
        results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
        `${screen} [${theme}]`,
      ).toEqual([]);
      const { scrollWidth, width } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        width: Math.ceil(Math.min(window.innerWidth, window.visualViewport?.width ?? window.innerWidth)),
      }));
      expect(scrollWidth, `${screen} [${theme}] overflows`).toBeLessThanOrEqual(width);
    }
    await setTheme(page, initial);
  }
});
