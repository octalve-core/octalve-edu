import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { Role, addMembership, createTenant, createUser, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { SAAS_URL } from "../support/env";
import { setTheme } from "../support/theme";
import { signInThroughUi } from "./helpers";
import { INFO_TIPS, type InfoTipKey } from "@/components/ui/info-tips";

// The info icons (task 0055) in a real browser, on Octalve's real pages. What is held here: each icon sits BESIDE what it explains (never inside it), explains it in the registry's words, is
// 16px, moves nothing around it when it opens and does not scroll or widen the page, and keeps its popover inside the window (a phone included); it opens on hover and on keyboard focus (desktop)
// or on a tap (phone); it closes on Escape (wherever the focus is) and on a click elsewhere; axe finds nothing with one open, in both themes. That the NAMES of the headings, labels and buttons
// beside an icon are unchanged is held by every other spec of the app, which finds them by those names and still passes. "One at a time" and "Escape inside a dialog" are held by AlEemaan's spec
// of the same component (no Octalve page has two icons, or one inside a dialog, yet), and are not repeated here.

test.use({ baseURL: SAAS_URL });

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

let school: TestTenant;

test.beforeAll(async () => {
  await seedInstance();
});
test.afterAll(async () => {
  await removeCreatedTenants();
});
test.beforeEach(async () => {
  school = await createTenant({ name: "Info Tip School" });
  // Promotion needs a session and a class before it shows its controls.
  await db.academicSession.create({
    data: { tenantId: school.id, label: "2051/2052", startDate: day("2051-09-01"), endDate: day("2052-07-20"), status: "ACTIVE" },
  });
  await db.classGroup.create({ data: { tenantId: school.id, name: "Year 1", sortOrder: 1 } });
});
test.afterEach(async () => {
  await removeCreatedTenants();
});

const tipButton = (page: Page, key: InfoTipKey) => page.locator(`[data-info-tip="${key}"]`);
const tooltip = (page: Page) => page.getByRole("tooltip");

async function signedInAdmin(page: Page) {
  const admin = await createUser({ name: "Amina Yusuf" });
  await addMembership(admin.id, school.id, Role.ADMIN);
  await signInThroughUi(page, admin);
}

async function academics(page: Page, section: string) {
  await page.goto(`/schools/${school.code}/academics?section=${section}`);
  await expect(page.getByRole("heading", { level: 1, name: "Academic setup" })).toBeVisible();
}
async function people(page: Page, section: string) {
  await page.goto(`/schools/${school.code}/people?section=${section}`);
  await expect(page.getByRole("heading", { level: 1, name: "People" })).toBeVisible();
}

type Place = { key: InfoTipKey; go: (page: Page) => Promise<void>; neighbour: (page: Page) => Locator };
const PLACES: Place[] = [
  {
    key: "academics.sessions",
    go: (page) => academics(page, "sessions"),
    neighbour: (page) => page.getByRole("button", { name: "New session" }),
  },
  {
    key: "academics.scales",
    go: (page) => academics(page, "grading"),
    neighbour: (page) => page.getByRole("button", { name: "New scale" }),
  },
  { key: "attendance.window", go: (page) => academics(page, "attendance"), neighbour: (page) => page.locator("#attendance-date") },
  {
    key: "promotion.passmark",
    go: (page) => academics(page, "promotion"),
    neighbour: (page) => page.getByLabel("Pass mark (%)", { exact: true }),
  },
  { key: "students.show", go: (page) => people(page, "students"), neighbour: (page) => page.getByLabel("Show", { exact: true }) },
  { key: "staff.show", go: (page) => people(page, "staff"), neighbour: (page) => page.getByLabel("Show", { exact: true }) },
];

/// How a person opens one: a mouse points at it (after the short delay), a finger taps it.
async function openIt(page: Page, icon: Locator, isMobile: boolean) {
  if (isMobile) await icon.tap();
  else await icon.hover();
  await expect(tooltip(page)).toBeVisible();
}

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  expect(b, "the element has a box").not.toBeNull();
  return b!;
}

for (const place of PLACES) {
  test(`the icon for ${place.key} sits beside what it explains, says what the registry says, and moves nothing`, async ({
    page,
    isMobile,
  }) => {
    await signedInAdmin(page);
    await place.go(page);
    const icon = tipButton(page, place.key);
    await expect(icon).toHaveCount(1);
    await expect(icon).toBeVisible();
    await expect(icon).toHaveAccessibleName("More information");

    // beside, never inside, a heading, a label, a column heading or another button
    await expect(
      icon.locator("xpath=ancestor::*[self::h1 or self::h2 or self::h3 or self::label or self::th or self::button][1]"),
    ).toHaveCount(0);

    // Scrolled into view FIRST: an icon below the fold is scrolled to by the hover or the tap, and a neighbour's box in window coordinates would then differ by the scroll, which is not a
    // layout shift.
    await icon.scrollIntoViewIfNeeded();

    // 16 px, with the invisible 44 px touch target around it (a pseudo-element: no box of its own to measure)
    const size = await box(icon);
    expect(Math.round(size.width)).toBe(16);
    expect(Math.round(size.height)).toBe(16);

    const before = await box(place.neighbour(page));
    const scrollWidth = () => page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    const widthBefore = await scrollWidth();
    const scrolledBefore = await page.evaluate(() => window.scrollY);
    await openIt(page, icon, isMobile);
    expect(await scrollWidth(), "the page is no wider with the tip open").toEqual(widthBefore);
    // ...and must not scroll the page (an earlier first-pass placement made Chrome scroll up 227 px a few milliseconds after a tap): read after two animation frames, not straight away
    await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
    expect(await page.evaluate(() => window.scrollY), "opening the tip does not scroll the page").toBe(scrolledBefore);
    await expect(tooltip(page)).toHaveText(INFO_TIPS[place.key]);
    await expect(icon).toHaveAttribute("aria-expanded", "true");
    const tipId = await tooltip(page).getAttribute("id");
    await expect(icon).toHaveAttribute("aria-describedby", tipId!);

    // the popover is inside the window, and nothing near it moved
    const view = page.viewportSize()!;
    const pop = await box(tooltip(page));
    expect(pop.x).toBeGreaterThanOrEqual(0);
    expect(pop.y).toBeGreaterThanOrEqual(0);
    expect(pop.x + pop.width).toBeLessThanOrEqual(view.width);
    expect(pop.y + pop.height).toBeLessThanOrEqual(view.height);
    const after = await box(place.neighbour(page));
    expect(after).toEqual(before);

    await page.keyboard.press("Escape");
    await expect(tooltip(page)).toHaveCount(0);
    await expect(icon).toHaveAttribute("aria-expanded", "false");
  });
}

test("desktop: it opens when the mouse points at it and closes when the mouse leaves", async ({ page, isMobile }) => {
  test.skip(isMobile, "a phone has no hover");
  await signedInAdmin(page);
  await academics(page, "sessions");
  const icon = tipButton(page, "academics.sessions");
  await expect(tooltip(page)).toHaveCount(0);
  await icon.hover();
  await expect(tooltip(page)).toBeVisible();
  // it stays open while the mouse moves from the icon onto the explanation
  await tooltip(page).hover();
  await expect(tooltip(page)).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(tooltip(page)).toHaveCount(0);
});

test("desktop: it opens when the keyboard reaches it, Escape closes it with the focus where it was, and a click elsewhere closes it too", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "the keyboard path is the desktop one");
  await signedInAdmin(page);
  await academics(page, "sessions");
  const icon = tipButton(page, "academics.sessions");
  for (let i = 0; i < 80; i += 1) {
    await page.keyboard.press("Tab");
    if (await icon.evaluate((el) => el === document.activeElement)) break;
  }
  await expect(icon).toBeFocused();
  await expect(tooltip(page)).toBeVisible();
  await expect(tooltip(page)).toHaveText(INFO_TIPS["academics.sessions"]);
  await page.keyboard.press("Escape");
  await expect(tooltip(page)).toHaveCount(0);
  await expect(icon).toBeFocused();

  // Enter on the icon opens it again; a click on the page closes it
  await page.keyboard.press("Enter");
  await expect(tooltip(page)).toBeVisible();
  await page.getByRole("heading", { level: 1, name: "Academic setup" }).click();
  await expect(tooltip(page)).toHaveCount(0);
});

test("desktop: Escape closes a tip that was opened by the mouse, with the mouse still on it", async ({ page, isMobile }) => {
  test.skip(isMobile, "a phone has no hover");
  await signedInAdmin(page);
  await academics(page, "sessions");
  await tipButton(page, "academics.sessions").hover();
  await expect(tooltip(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(tooltip(page)).toHaveCount(0);
});

test("phone: a tap opens it, a second tap closes it, and a tap elsewhere closes it", async ({ page, isMobile }) => {
  test.skip(!isMobile, "a tap is the phone path");
  await signedInAdmin(page);
  await academics(page, "sessions");
  const icon = tipButton(page, "academics.sessions");
  await icon.tap();
  await expect(tooltip(page)).toBeVisible();
  await icon.tap();
  await expect(tooltip(page)).toHaveCount(0);
  await icon.tap();
  await expect(tooltip(page)).toBeVisible();
  await page.getByRole("heading", { level: 1, name: "Academic setup" }).tap();
  await expect(tooltip(page)).toHaveCount(0);
});

for (const theme of ["dark", "light"] as const) {
  test(`axe finds nothing on a page with a tip open (${theme} theme)`, async ({ page, isMobile }) => {
    await signedInAdmin(page);
    await academics(page, "sessions");
    if (theme === "light") await setTheme(page, "light");
    await openIt(page, tipButton(page, "academics.sessions"), isMobile);
    const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(
      results.violations.map((v) => `${v.id} [${v.impact}] ${v.help}`),
      `accessibility violations with a tip open (${theme})`,
    ).toEqual([]);
  });
}
