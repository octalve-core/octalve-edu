import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "../support/fixtures";
import type { BrowserContext, Page } from "@playwright/test";
import { Role, addMembership, createTenant, createUser, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { SAAS_URL } from "../support/env";
import { signInThroughUi, waitForHydration } from "./helpers";

// The app shell in a real browser (domain-implementation-plan.md §0.5.2-H): the school-aware sidebar, top bar, account
// menu, school switcher and — on a phone — the tab bar and "More" sheet. Several schools share the database, so this runs on
// the SaaS-mode server. The shell only DISPLAYS; every assertion about access lives with the pages and APIs.
test.use({ baseURL: SAAS_URL });

let a: TestTenant;
let b: TestTenant;

test.beforeAll(async () => {
  await seedInstance();
  a = await createTenant({ name: "Alpha School", campuses: ["Alpha North"] });
  b = await createTenant({ name: "Beta Academy", campuses: ["Beta Main"] });
});
test.afterAll(async () => {
  await removeCreatedTenants();
});

const mainNav = (page: Page) => page.getByRole("navigation", { name: "Main" });
const breadcrumb = (page: Page) => page.getByRole("navigation", { name: "Breadcrumb" });
const accountMenu = (page: Page) => page.getByRole("button", { name: /^Account menu for/ });
const sidebar = (page: Page) => page.locator("#app-sidebar");
const shellRoot = (page: Page) => page.locator("[data-sidebar]");
const toggle = (page: Page) => sidebar(page).getByRole("button", { name: /^(Collapse|Expand) sidebar$/ });
const sectionButton = (page: Page, name: string) => mainNav(page).getByRole("button", { name });
const cookieValue = async (context: BrowserContext, name: string) => (await context.cookies()).find((c) => c.name === name)?.value;
const sidebarWidth = (page: Page) => sidebar(page).evaluate((el) => Math.round(el.getBoundingClientRect().width));
/// The left edge of the page beside the sidebar: the top bar spans it, whereas `#main` is centred in a max width and so moves by only half the change.
const pageLeft = (page: Page) =>
  page
    .locator("header")
    .first()
    .evaluate((el) => Math.round(el.getBoundingClientRect().left));
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function expectAccessible(page: Page, what: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  const report = results.violations.map(
    (v) =>
      `${v.id} [${v.impact}] ${v.help}: ${v.nodes
        .slice(0, 3)
        .map((n) => n.target.join(" "))
        .join(" | ")}`,
  );
  expect(report, `accessibility violations on ${what}`).toEqual([]);
}

/// A pointer arriving on an element from outside the window. Playwright's own hover moves a real mouse; this is for the case it cannot make: a finger.
const pointerArrives = (page: Page, selector: string, pointerType: "mouse" | "touch") =>
  page
    .locator(selector)
    .first()
    .evaluate(
      (el, type) => el.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: type, relatedTarget: null })),
      pointerType,
    );

async function signedInAs(page: Page, role: Role, opts: { name?: string; also?: Role } = {}) {
  const user = await createUser({ name: opts.name ?? "Amina Yusuf" });
  await addMembership(user.id, a.id, role, role === Role.ADMIN ? null : a.campuses[0].id);
  if (opts.also) await addMembership(user.id, b.id, opts.also, opts.also === Role.ADMIN ? null : b.campuses[0].id);
  await signInThroughUi(page, user);
  // Wait for where the person ends up, not for `/dashboard` on the way: the front door forwards someone with ONE school into it a moment after it shows (a second client
  // navigation, which re-mounts the shell), and a menu opened in between closes by itself.
  await expect(page).toHaveURL(opts.also ? /\/dashboard$/ : new RegExp(`/schools/${a.code}$`));
  await waitForHydration(page); // the tests click straight away: an un-hydrated button swallows the click
  return user;
}

test.describe("on a desktop: the sidebar and the top bar", () => {
  test.beforeEach(({ isMobile }) => test.skip(isMobile, "the sidebar exists from the `lg` breakpoint up"));

  test("an ADMIN: the school's name, Overview (current), Users and Settings as links (Settings is built since 1.7)", async ({ page }) => {
    await signedInAs(page, Role.ADMIN);
    await expect(page).toHaveURL(new RegExp(`/schools/${a.code}$`));
    const nav = mainNav(page);
    await expect(nav.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    await expect(nav.getByRole("link", { name: "Users" })).toHaveAttribute("href", `/schools/${a.code}/users`);
    await expect(nav.getByRole("link", { name: "Users" })).not.toHaveAttribute("aria-current", "page");
    await expect(nav.getByRole("link", { name: "Settings" })).toHaveAttribute("href", `/schools/${a.code}/settings`); // built in 1.7: a real link
    await expect(nav.getByText(", coming soon")).toHaveCount(0); // nothing in the list is "coming soon" any more
    await expect(page.getByText("Alpha School").first()).toBeVisible(); // the school, under the brand
    await expect(breadcrumb(page)).toContainText("Alpha School");
    await expect(breadcrumb(page).getByText("Overview")).toHaveAttribute("aria-current", "page");
    const card = page.getByRole("group", { name: "Signed in as" }); // the person card: who, and the role IN this school
    await expect(card).toContainText("Amina Yusuf");
    await expect(card).toContainText("Administrator");
  });

  test("anyone else sees Overview only — the role in THIS school decides what is drawn", async ({ page }) => {
    await signedInAs(page, Role.TEACHING_STAFF);
    const nav = mainNav(page);
    await expect(nav.getByRole("link", { name: "Overview" })).toBeVisible();
    await expect(nav.getByText("Users")).toHaveCount(0);
    await expect(nav.getByText("Settings")).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Signed in as" })).toContainText("Teaching staff");
    // The account menu follows the same rule: Settings (soon) is an administrator's entry.
    await accountMenu(page).click();
    await expect(page.getByRole("link", { name: "Profile" })).toBeVisible();
    await expect(page.locator("header").getByText("Settings")).toHaveCount(0);
  });

  test("ONE school: its name is plain text — there is nothing to switch to", async ({ page }) => {
    await signedInAs(page, Role.ADMIN);
    await expect(page.getByRole("button", { name: /School/ })).toHaveCount(0);
    await expect(page.getByText("Alpha School").first()).toBeVisible();
  });

  test("SEVERAL schools: a switcher lists each with the role held there, marks the current one, and changes school", async ({ page }) => {
    await signedInAs(page, Role.TEACHING_STAFF, { also: Role.ADMIN });
    await expect(page).toHaveURL(/\/dashboard$/); // two schools → the picker is the front door
    await expect(breadcrumb(page)).toContainText("Octalve Edu"); // outside a school, the product
    await expect(mainNav(page).getByRole("link", { name: "Your schools" })).toHaveAttribute("aria-current", "page");

    await page.goto(`/schools/${a.code}`);
    const switcher = page.getByRole("button", { name: /School.*Alpha School/ });
    await expect(switcher).toHaveAttribute("aria-expanded", "false");
    await switcher.click();
    await expect(switcher).toHaveAttribute("aria-expanded", "true");
    const alpha = page.getByRole("link", { name: /Alpha School.*Teaching staff/ });
    const beta = page.getByRole("link", { name: /Beta Academy.*Administrator/ });
    await expect(alpha).toHaveAttribute("aria-current", "true");
    await expect(beta).not.toHaveAttribute("aria-current", "true");

    await beta.click();
    await expect(page).toHaveURL(new RegExp(`/schools/${b.code}$`));
    await expect(breadcrumb(page)).toContainText("Beta Academy");
    await expect(page.getByRole("button", { name: /School.*Beta Academy/ })).toHaveAttribute("aria-expanded", "false"); // closed by navigating
    await expect(mainNav(page).getByText("Users")).toBeVisible(); // Beta: an administrator → the admin entries are drawn
    await page.goto(`/schools/${a.code}`);
    await expect(mainNav(page).getByText("Users")).toHaveCount(0); // …and Alpha: a teacher → they are not (per school)
  });

  test("the switcher closes on Escape (focus back on its button) and on a click elsewhere", async ({ page }) => {
    await signedInAs(page, Role.TEACHING_STAFF, { also: Role.ADMIN });
    await page.goto(`/schools/${a.code}`);
    const switcher = page.getByRole("button", { name: /School.*Alpha School/ });
    await switcher.click();
    await expect(page.getByRole("link", { name: /Beta Academy/ })).toBeVisible();
    await page.keyboard.press("Tab"); // focus moves INTO the panel…
    await expect(page.getByRole("link", { name: /Alpha School/ })).toBeFocused();
    await page.keyboard.press("Escape"); // …so the panel's disappearance would drop it on <body> unless it is put back
    await expect(page.getByRole("link", { name: /Beta Academy/ })).toHaveCount(0);
    await expect(switcher).toBeFocused();
    await switcher.click();
    // A click on truly inert space (the top bar's empty middle): nothing is focusable there, so the BLUR path cannot close
    // it — only the outside-click handler can. (Clicking the page heading used to look like proof; it focuses <main>.)
    await page.mouse.click(760, 30);
    await expect(page.getByRole("link", { name: /Beta Academy/ })).toHaveCount(0);
  });

  test("a school the person is NOT in: the page is a 403 and the shell shows no trace of it", async ({ page }) => {
    await signedInAs(page, Role.ADMIN);
    const response = await page.goto(`/schools/${b.code}`);
    expect(response?.status()).toBe(403);
    await expect(page.getByRole("heading", { level: 1, name: "You don't have access to this school" })).toBeVisible();
    await expect(page.getByText("Beta Academy")).toHaveCount(0);
    await expect(breadcrumb(page)).toContainText("Octalve Edu"); // matched nothing: the shell treats it as no school
    await expect(mainNav(page)).toBeVisible(); // the person can still get around from the 403 page
    await expect(page.getByText("Alpha School").first()).toBeVisible(); // their OWN school is in the shell
  });

  test("the account page lives in the shell: with ONE school the sidebar still leads into it; with several it asks them to choose", async ({
    page,
  }) => {
    await signedInAs(page, Role.ADMIN);
    await page.goto("/account");
    await expect(page.getByRole("heading", { level: 1, name: "Account" })).toBeVisible();
    await expect(breadcrumb(page).getByText("Account")).toHaveAttribute("aria-current", "page");
    await expect(breadcrumb(page).getByText("Octalve Edu")).toBeVisible(); // the account page is the PERSON's: the product, not a school
    await expect(mainNav(page).getByRole("link", { name: "Overview" })).toHaveAttribute("href", `/schools/${a.code}`);
  });

  test("the account page with SEVERAL schools: 'Your schools' and the switcher, no school guessed", async ({ page }) => {
    await signedInAs(page, Role.TEACHING_STAFF, { also: Role.ADMIN });
    await page.goto("/account");
    await expect(mainNav(page).getByRole("link", { name: "Your schools" })).toBeVisible();
    await expect(page.getByRole("button", { name: /School.*Choose a school/ })).toBeVisible();
  });

  test("the account menu: opens, shows who you are and where, goes to Profile, and Escape closes it with focus back on its button", async ({
    page,
  }) => {
    await signedInAs(page, Role.ADMIN, { name: "Tunde Bello" });
    const menu = accountMenu(page);
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await menu.click();
    await expect(page.locator("header").getByText("Administrator · Alpha School")).toBeVisible();
    await page.keyboard.press("Tab"); // focus into the panel (Profile), then Escape must put it back on the button
    await expect(page.getByRole("link", { name: "Profile" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("link", { name: "Profile" })).toHaveCount(0);
    await expect(menu).toBeFocused();
    await menu.click();
    await page.mouse.click(760, 30); // inert space: only the outside-click handler can close it
    await expect(page.getByRole("link", { name: "Profile" })).toHaveCount(0);
    await menu.click();
    await page.getByRole("link", { name: "Profile" }).click();
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByRole("link", { name: "Profile" })).toHaveCount(0); // closed by navigating
  });

  test("the account menu has a Video guide link, and it leads to the video guide page", async ({ page }) => {
    await signedInAs(page, Role.ADMIN, { name: "Tunde Bello" });
    await accountMenu(page).click();
    await expect(page.getByRole("link", { name: "Video guide" })).toHaveAttribute("href", "/video-guide");
    await page.getByRole("link", { name: "Video guide" }).click();
    await expect(page).toHaveURL(/\/video-guide$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("Sign out from the account menu ends the session and lands on the sign-in screen", async ({ page }) => {
    await signedInAs(page, Role.ADMIN);
    await accountMenu(page).click();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto(`/schools/${a.code}`);
    await expect(page).toHaveURL(/\/login/); // really signed out
  });

  test("the skip link is the first thing in the tab order and moves focus to the page content", async ({ page }) => {
    await signedInAs(page, Role.ADMIN);
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("main#main")).toBeFocused();
  });
});

test.describe("on a desktop: the sidebar in sections", () => {
  test.beforeEach(({ isMobile }) => test.skip(isMobile, "the sidebar exists from the `lg` breakpoint up"));

  test("an ADMIN: Overview on its own, then Administration and Learning, each holding its pages", async ({ page }) => {
    await signedInAs(page, Role.ADMIN);
    const nav = mainNav(page);
    for (const name of ["Administration", "Learning"]) await expect(sectionButton(page, name)).toHaveAttribute("aria-expanded", "true");
    const pagesOf = (name: string) => nav.locator(`#${"sidebar-section-" + name.toLowerCase()}`).getByRole("link");
    await expect(pagesOf("Administration")).toHaveText(["Academics", "People", "Finance", "Communication", "Users", "Settings"]);
    await expect(pagesOf("Learning")).toHaveText(["Question bank", "Forms", "Programs"]);
    await expect(nav.locator("ul ul").getByRole("link", { name: "Overview" })).toHaveCount(0); // Overview is not inside a section
  });

  test("folding a section hides its pages from the screen and the keyboard; unfolding brings them back; the choice is a cookie", async ({
    page,
    context,
  }) => {
    await signedInAs(page, Role.ADMIN);
    expect(await cookieValue(context, "sidebar-sections")).toBeUndefined();

    const button = sectionButton(page, "Administration");
    await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "false");
    await expect(mainNav(page).getByRole("link", { name: "Users" })).toBeHidden();
    await expect(mainNav(page).getByRole("link", { name: "Forms" })).toBeVisible(); // the other section is untouched
    expect(await cookieValue(context, "sidebar-sections")).toBe("administration");

    await button.focus(); // folded pages are out of the tab order
    await page.keyboard.press("Tab");
    await expect(sectionButton(page, "Learning")).toBeFocused();

    await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "true");
    await expect(mainNav(page).getByRole("link", { name: "Users" })).toBeVisible();
    expect(await cookieValue(context, "sidebar-sections")).toBe("");
  });

  test("a folded section stays folded after a reload, on the very first paint (the server read the cookie)", async ({ page }) => {
    await signedInAs(page, Role.ADMIN);
    await sectionButton(page, "Learning").click();
    await page.reload();
    await expect(sectionButton(page, "Learning")).toHaveAttribute("aria-expanded", "false");
    await expect(sectionButton(page, "Administration")).toHaveAttribute("aria-expanded", "true");
    await expect(mainNav(page).getByRole("link", { name: "Forms" })).toBeHidden();
  });

  test("a hand-edited cookie can only pick states that exist: unknown names are ignored", async ({ page, context }) => {
    await signedInAs(page, Role.ADMIN);
    await context.addCookies([
      { name: "sidebar-sections", value: "learning,<b>x</b>,__proto__", url: SAAS_URL },
      { name: "sidebar", value: "sideways", url: SAAS_URL },
    ]);
    await page.reload();
    await expect(sectionButton(page, "Learning")).toHaveAttribute("aria-expanded", "false");
    await expect(sectionButton(page, "Administration")).toHaveAttribute("aria-expanded", "true");
    await expect(shellRoot(page)).toHaveAttribute("data-sidebar", "expanded");
  });

  test("arriving on a page inside a folded section opens that section, and a deliberate fold is still remembered", async ({
    page,
    context,
  }) => {
    await signedInAs(page, Role.ADMIN);
    await sectionButton(page, "Administration").click();
    await expect(sectionButton(page, "Administration")).toHaveAttribute("aria-expanded", "false");

    await page.goto(`/schools/${a.code}/users`);
    await expect(sectionButton(page, "Administration")).toHaveAttribute("aria-expanded", "true");
    await expect(mainNav(page).getByRole("link", { name: "Users" })).toHaveAttribute("aria-current", "page");
    expect(await cookieValue(context, "sidebar-sections")).toBe("administration"); // opening it for this page is not a new preference
  });

  test("staff see two sections; a pupil sees no section at all", async ({ page }) => {
    await signedInAs(page, Role.TEACHING_STAFF);
    await expect(sectionButton(page, "Administration")).toBeVisible();
    await expect(sectionButton(page, "Learning")).toBeVisible();
    await expect(mainNav(page).getByRole("link")).toHaveText(["Overview", "Academics", "People", "Question bank", "Forms", "Programs"]);
  });

  test("a pupil's sidebar has no sections: Overview and My work", async ({ page }) => {
    await signedInAs(page, Role.STUDENT);
    await expect(mainNav(page).getByRole("button")).toHaveCount(0);
    await expect(mainNav(page).getByRole("link")).toHaveText(["Overview", "My work"]);
  });

  test("a platform administrator's Platform link comes last as a plain link with a rule above it, not as a page of Learning", async ({
    page,
  }) => {
    const user = await createUser({ name: "Plat Admin", platformAdmin: true });
    await addMembership(user.id, a.id, Role.ADMIN, null);
    await signInThroughUi(page, user);
    await expect(page).toHaveURL(new RegExp(`/schools/${a.code}$`));
    await waitForHydration(page);
    const platform = mainNav(page).getByRole("link", { name: "Platform" });
    await expect(platform).toBeVisible();
    await expect(mainNav(page).getByRole("link").last()).toHaveText("Platform");
    expect(await platform.locator("xpath=..").evaluate((li) => getComputedStyle(li).borderTopWidth)).toBe("1px");
  });
});

test.describe("on a desktop: the sidebar folds to icons and opens when an icon is hovered", () => {
  test.beforeEach(({ isMobile }) => test.skip(isMobile, "the sidebar exists from the `lg` breakpoint up"));

  test("the toggle folds it to a rail, moves the page over, and is remembered", async ({ page, context }) => {
    await signedInAs(page, Role.ADMIN, { name: "Amina Yusuf" });
    await expect(shellRoot(page)).toHaveAttribute("data-sidebar", "expanded");
    expect(await sidebarWidth(page)).toBe(248);
    expect(await pageLeft(page)).toBe(248);

    await toggle(page).click();
    await expect(toggle(page)).toHaveAccessibleName("Expand sidebar");
    await expect(shellRoot(page)).toHaveAttribute("data-sidebar", "collapsed");
    await expect(sidebar(page)).toHaveAttribute("data-state", "rail");
    await expect.poll(() => sidebarWidth(page)).toBe(64);
    await expect.poll(() => pageLeft(page)).toBe(64); // the page took the space
    expect(await cookieValue(context, "sidebar")).toBe("collapsed");

    // Icons only: no visible words, but every link keeps its name.
    const users = mainNav(page).getByRole("link", { name: "Users" });
    await expect(users).toBeVisible();
    expect((await users.boundingBox())!.width).toBeLessThanOrEqual(48);
    await expect(sidebar(page).getByText("Octalve Edu", { exact: true })).not.toBeInViewport();
    await expect(sidebar(page).getByText("Amina Yusuf")).not.toBeInViewport();
    await expect(sidebar(page).getByText("Alpha School")).not.toBeInViewport();

    await page.reload();
    await expect(shellRoot(page)).toHaveAttribute("data-sidebar", "collapsed"); // the first paint after a reload is already the rail
    await expect(sidebar(page)).toHaveAttribute("data-state", "rail");

    await toggle(page).click();
    await expect(toggle(page)).toHaveAccessibleName("Collapse sidebar");
    await expect.poll(() => sidebarWidth(page)).toBe(248);
    expect(await cookieValue(context, "sidebar")).toBe("expanded");
  });

  test("the toggle is a round arrow on the sidebar's right edge near the top, clear of the brand mark in the rail, and not covered by the top bar", async ({
    page,
  }) => {
    await signedInAs(page, Role.ADMIN);
    const straddles = async () => {
      const box = (await toggle(page).boundingBox())!;
      const width = await sidebarWidth(page);
      return { overhangs: box.x < width && box.x + box.width > width, top: box.y, round: Math.abs(box.width - box.height) <= 1 };
    };
    let at = await straddles();
    expect(at.overhangs).toBe(true);
    expect(at.top).toBeLessThan(60);
    expect(at.round).toBe(true);

    await toggle(page).click(); // Playwright refuses a click that another element would receive: the top bar does not cover it
    await expect(sidebar(page)).toHaveAttribute("data-state", "rail");
    await expect.poll(() => sidebarWidth(page)).toBe(64);
    at = await straddles();
    expect(at.overhangs).toBe(true);
    const brand = (await sidebar(page).locator("[data-part=brand] > span").first().boundingBox())!;
    expect((await toggle(page).boundingBox())!.x).toBeGreaterThanOrEqual(brand.x + brand.width);
  });

  test("hovering an icon opens it over the page (the page does not move); moving away closes it", async ({ page }) => {
    await signedInAs(page, Role.ADMIN, { name: "Amina Yusuf" });
    await toggle(page).click();
    await expect.poll(() => sidebarWidth(page)).toBe(64);
    const resting = await pageLeft(page);

    await mainNav(page).getByRole("link", { name: "Users" }).hover();
    await expect(sidebar(page)).toHaveAttribute("data-state", "peek");
    await expect.poll(() => sidebarWidth(page)).toBe(248);
    await expect(mainNav(page).getByText("Users", { exact: true })).toBeInViewport();
    await expect(sidebar(page).getByText("Alpha School")).toBeInViewport();
    expect(await pageLeft(page)).toBe(resting);
    await expect(shellRoot(page)).toHaveAttribute("data-sidebar", "collapsed");

    await page.mouse.move(900, 400);
    await expect(sidebar(page)).toHaveAttribute("data-state", "rail");
    await expect.poll(() => sidebarWidth(page)).toBe(64);
  });

  test("hovering the person, or the school's icon, opens it too; hovering the toggle or the brand does nothing", async ({ page }) => {
    await signedInAs(page, Role.ADMIN);
    await toggle(page).click();
    await expect(sidebar(page)).toHaveAttribute("data-state", "rail");

    await toggle(page).hover();
    await page.waitForTimeout(500); // longer than any delay the sidebar has
    await expect(sidebar(page)).toHaveAttribute("data-state", "rail");
    await sidebar(page).locator("[data-part=brand]").hover();
    await page.waitForTimeout(500);
    await expect(sidebar(page)).toHaveAttribute("data-state", "rail");

    await sidebar(page).locator("[data-part=foot]").getByText("Administrator").hover({ force: true });
    await expect(sidebar(page)).toHaveAttribute("data-state", "peek");
    await page.mouse.move(900, 400);
    await expect(sidebar(page)).toHaveAttribute("data-state", "rail");

    await sidebar(page).locator("[data-part=top]").hover();
    await expect(sidebar(page)).toHaveAttribute("data-state", "peek");
  });

  test("a finger does not open it by hovering; a mouse does", async ({ page }) => {
    await signedInAs(page, Role.ADMIN);
    await toggle(page).click();
    await expect(sidebar(page)).toHaveAttribute("data-state", "rail");
    await pointerArrives(page, "#app-sidebar nav a", "touch");
    await page.waitForTimeout(400);
    await expect(sidebar(page)).toHaveAttribute("data-state", "rail");
    await pointerArrives(page, "#app-sidebar nav a", "mouse");
    await expect(sidebar(page)).toHaveAttribute("data-state", "peek");
  });

  test("the keyboard does what the hover does: focus in the icons opens it, Escape closes it, the toggle never opens it", async ({
    page,
  }) => {
    await signedInAs(page, Role.ADMIN);
    await toggle(page).click();
    await expect(sidebar(page)).toHaveAttribute("data-state", "rail");

    await toggle(page).focus();
    await page.waitForTimeout(300);
    await expect(sidebar(page)).toHaveAttribute("data-state", "rail");

    await mainNav(page).getByRole("link", { name: "Overview" }).focus();
    await expect(sidebar(page)).toHaveAttribute("data-state", "peek");
    await page.keyboard.press("Escape");
    await expect(sidebar(page)).toHaveAttribute("data-state", "rail");

    await toggle(page).focus(); // focus() on the link that already has it would not be a new arrival
    await mainNav(page).getByRole("link", { name: "Overview" }).focus();
    await expect(sidebar(page)).toHaveAttribute("data-state", "peek");
    await page.getByRole("link", { name: "Skip to content" }).focus(); // focus leaves the sidebar
    await expect(sidebar(page)).toHaveAttribute("data-state", "rail");
  });

  test("in the rail a section heading shows only its chevron and still folds the section", async ({ page }) => {
    await signedInAs(page, Role.ADMIN);
    await toggle(page).click();
    await expect(sidebar(page)).toHaveAttribute("data-state", "rail");
    await expect.poll(() => sidebarWidth(page)).toBe(64); // measure after the width change, not during it
    const heading = sectionButton(page, "Administration");
    await expect(heading).toBeVisible();
    expect((await heading.boundingBox())!.width).toBeLessThanOrEqual(48);
    await heading.click();
    await expect(heading).toHaveAttribute("aria-expanded", "false");
    await expect(mainNav(page).getByRole("link", { name: "Users" })).toBeHidden();
  });

  test("nothing jumps when the rail opens: the icons and the navigation stay where they are, with one school and with several", async ({
    page,
  }) => {
    for (const setup of [
      () => signedInAs(page, Role.ADMIN),
      async () => {
        await signedInAs(page, Role.TEACHING_STAFF, { also: Role.ADMIN });
        await page.goto(`/schools/${a.code}`);
        await waitForHydration(page);
      },
    ]) {
      await page.context().clearCookies();
      await setup();
      await toggle(page).click();
      await expect.poll(() => sidebarWidth(page)).toBe(64);
      const link = mainNav(page).getByRole("link", { name: "Overview" });
      const icon = link.locator("svg");
      const resting = (await icon.boundingBox())!;
      const restingLink = (await link.boundingBox())!;

      await link.hover();
      await expect.poll(() => sidebarWidth(page)).toBe(248);
      const open = (await icon.boundingBox())!;
      const openLink = (await link.boundingBox())!;
      expect(Math.abs(open.x - resting.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(open.y - resting.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(openLink.y - restingLink.y)).toBeLessThanOrEqual(1); // the school switcher keeps its height in the rail
    }
  });

  test("with several schools, the switcher is there once the sidebar is open: hover an icon, then change school", async ({ page }) => {
    await signedInAs(page, Role.TEACHING_STAFF, { also: Role.ADMIN });
    await page.goto(`/schools/${a.code}`);
    await waitForHydration(page);
    await toggle(page).click();
    await expect(sidebar(page)).toHaveAttribute("data-state", "rail");
    await expect(page.getByRole("button", { name: /School.*Alpha School/ })).toHaveCount(0); // a building icon stands in for it

    await mainNav(page).getByRole("link", { name: "Overview" }).hover();
    await expect(sidebar(page)).toHaveAttribute("data-state", "peek");
    const switcher = page.getByRole("button", { name: /School.*Alpha School/ });
    await switcher.click();
    await page.getByRole("link", { name: /Beta Academy.*Administrator/ }).click();
    await expect(page).toHaveURL(new RegExp(`/schools/${b.code}$`));
  });
});

test.describe("on a desktop: the signed-in person stays pinned at the foot", () => {
  test.beforeEach(({ isMobile }) => test.skip(isMobile, "the sidebar exists from the `lg` breakpoint up"));

  const foot = (page: Page) => sidebar(page).locator("[data-part=foot]");
  const bottomOf = (locator: ReturnType<typeof foot>) => locator.evaluate((el) => Math.round(el.getBoundingClientRect().bottom));

  test("a pupil's list is two entries, and the person is still at the bottom edge", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await signedInAs(page, Role.STUDENT, { name: "Zainab Bello" });
    expect(await bottomOf(foot(page))).toBe(900);
    await expect(foot(page)).toContainText("Zainab Bello");
    const navBottom = await mainNav(page).evaluate((el) => Math.round(el.getBoundingClientRect().bottom));
    expect(navBottom).toBeLessThan(500); // there really is empty room between the list and the person
  });

  test("folding every section does not lift it, and neither does folding the sidebar to the rail", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await signedInAs(page, Role.ADMIN);
    for (const name of ["Administration", "Learning"]) await sectionButton(page, name).click();
    expect(await bottomOf(foot(page))).toBe(900);
    await toggle(page).click();
    await expect(sidebar(page)).toHaveAttribute("data-state", "rail");
    expect(await bottomOf(foot(page))).toBe(900);
  });

  test("in a short window the list scrolls and the person never leaves the screen", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 380 });
    await signedInAs(page, Role.ADMIN);
    expect(await bottomOf(foot(page))).toBe(380);
    const scroller = mainNav(page).locator("xpath=..");
    const { scrollHeight, clientHeight } = await scroller.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    expect(scrollHeight).toBeGreaterThan(clientHeight);
    await expect(toggle(page)).toBeInViewport();
    await expect(foot(page).getByText("Administrator")).toBeInViewport();
    await mainNav(page).getByRole("link", { name: "Settings" }).scrollIntoViewIfNeeded();
    await expect(mainNav(page).getByRole("link", { name: "Settings" })).toBeInViewport();
  });
});

test.describe("on a desktop: the sidebar is accessible and fits, in both themes, open and folded", () => {
  test.beforeEach(({ isMobile }) => test.skip(isMobile, "the sidebar exists from the `lg` breakpoint up"));

  for (const theme of ["dark", "light"] as const) {
    for (const state of ["open", "rail", "peek"] as const) {
      test(`${theme} theme, ${state}: no axe violations, no horizontal scrolling`, async ({ page, context }) => {
        await context.addCookies([{ name: "theme", value: theme, url: SAAS_URL }]);
        await signedInAs(page, Role.ADMIN, { name: "Amina Yusuf" });
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        if (state !== "open") await toggle(page).click();
        if (state === "peek") {
          await mainNav(page).getByRole("link", { name: "Users" }).hover();
          await expect(sidebar(page)).toHaveAttribute("data-state", "peek");
        }
        await expect.poll(() => sidebarWidth(page)).toBe(state === "rail" ? 64 : 248);
        await expectAccessible(page, `${theme}/${state}`);
        const { scrollWidth, innerWidth } = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
        }));
        expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
      });
    }
  }
});

test.describe("on a phone: the tab bar and the More sheet", () => {
  test.beforeEach(({ isMobile }) => test.skip(!isMobile, "the tab bar exists below the `lg` breakpoint"));

  test("the sidebar is absent; the tab bar has Overview (current) and More; the page is not covered by it", async ({ page }) => {
    await signedInAs(page, Role.ADMIN);
    const nav = mainNav(page);
    await expect(nav).toHaveCount(1); // only the tab bar is in the accessibility tree
    await expect(nav.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    await expect(nav.getByRole("button", { name: "More" })).toBeVisible();
    await expect(page.getByText("Skip to content")).toHaveCount(1); // present for keyboards, visually hidden
    const lastCard = page.getByText("Alpha North");
    await lastCard.scrollIntoViewIfNeeded();
    const card = await lastCard.boundingBox();
    const bar = await nav.boundingBox();
    expect(card && bar && card.y + card.height <= bar.y).toBe(true); // the bar never covers the last thing on the page
  });

  test("More: who you are and where, Users and Settings, Profile, Sign out; Escape closes it and returns focus", async ({ page }) => {
    await signedInAs(page, Role.ADMIN, { name: "Tunde Bello" });
    const more = mainNav(page).getByRole("button", { name: "More" });
    await more.click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("heading", { name: "Tunde Bello" })).toBeVisible();
    await expect(sheet.getByText("Administrator · Alpha School")).toBeVisible();
    // An administrator has eight pages (Finance and Programs came after Communication): the bar holds four tabs and the rest live in this sheet (MobileNav), not on the bar.
    await expect(mainNav(page).getByRole("link", { name: "Finance" })).toBeVisible();
    await expect(mainNav(page).getByRole("link", { name: "Communication" })).toHaveCount(0);
    await expect(sheet.getByRole("link", { name: "Communication" })).toBeVisible();
    await expect(mainNav(page).getByRole("link", { name: "Users" })).toHaveCount(0);
    await expect(sheet.getByRole("link", { name: "Users" })).toBeVisible();
    await expect(mainNav(page).getByRole("link", { name: "Settings" })).toHaveCount(0);
    await expect(sheet.getByRole("link", { name: "Settings" })).toBeVisible();
    await expect(sheet.getByRole("link", { name: "Profile" })).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Sign out" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(more).toBeFocused();
  });

  test("More groups the pages that do not fit the bar under the same section headings as the desktop sidebar; there is no sidebar", async ({
    page,
  }) => {
    await signedInAs(page, Role.ADMIN);
    await expect(page.locator("#app-sidebar")).toBeHidden();
    await mainNav(page).getByRole("button", { name: "More" }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByRole("heading", { level: 3 })).toHaveText(["Administration", "Learning"]);
    await expect(sheet.getByRole("button", { name: "Administration" })).toHaveCount(0); // a sheet is short-lived: its headings do not fold
    const learning = sheet.getByRole("heading", { name: "Learning" }).locator("xpath=..");
    await expect(learning.getByRole("link")).toHaveText(["Question bank", "Forms", "Programs"]);
  });

  test("a tap outside the sheet (on the dimmed page) closes it", async ({ page }) => {
    await signedInAs(page, Role.ADMIN);
    const more = mainNav(page).getByRole("button", { name: "More" });
    await more.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.mouse.click(8, 8); // the top-left corner: the backdrop, well clear of the sheet
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(more).toBeFocused();
  });

  test("More with SEVERAL schools lists them; choosing one goes there and closes the sheet", async ({ page }) => {
    await signedInAs(page, Role.TEACHING_STAFF, { also: Role.ADMIN });
    await page.goto(`/schools/${a.code}`);
    await mainNav(page).getByRole("button", { name: "More" }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByRole("link", { name: /Alpha School/ })).toHaveAttribute("aria-current", "true");
    await sheet.getByRole("link", { name: /Beta Academy/ }).click();
    await expect(page).toHaveURL(new RegExp(`/schools/${b.code}$`));
    await expect(sheet).toBeHidden();
  });

  test("a person with ONE school sees no school list in the sheet", async ({ page }) => {
    await signedInAs(page, Role.ADMIN);
    await mainNav(page).getByRole("button", { name: "More" }).click();
    await expect(page.getByRole("dialog").getByRole("heading", { name: "Your schools" })).toHaveCount(0);
  });

  test("Sign out from the More sheet", async ({ page }) => {
    await signedInAs(page, Role.ADMIN);
    await mainNav(page).getByRole("button", { name: "More" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test("Profile from the sheet opens the account page inside the shell", async ({ page }) => {
    await signedInAs(page, Role.TEACHING_STAFF);
    await mainNav(page).getByRole("button", { name: "More" }).click();
    await page.getByRole("dialog").getByRole("link", { name: "Profile" }).click();
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByRole("heading", { level: 1, name: "Account" })).toBeVisible();
    await expect(page.getByRole("dialog")).toBeHidden();
  });
});
