import "../support/env";
import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "@playwright/test";
import { Role } from "@prisma/client";
import { SAAS_URL } from "../support/env";
import { addMembership, createTenant, createUser, removeCreatedTenants, seedInstance, type TestTenant, type TestUser } from "../support/db";
import { setTheme } from "../support/theme";
import { signInThroughUi, waitForHydration } from "./helpers";

// Task 0058: the line above the Communication tabs while the school's waiting messages are sent in the background. The server's answers are replaced here (the real ones are tested in
// tests/integration/dispatch-batch.spec.ts and tests/api/communication-queue.spec.ts), so that each state is seen as the administrator sees it.

test.use({ baseURL: SAAS_URL });

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
// the count carries no query string here, and `next` is a POST: a glob must match the whole URL
const QUEUE = "**/api/v1/schools/*/communication/queue";
const NEXT = "**/api/v1/schools/*/communication/queue/next";

const json = (data: unknown, status = 200) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify({ data, meta: {}, error: null }),
});

async function scan(page: Page, what: string) {
  for (const theme of ["dark", "light"]) {
    await setTheme(page, theme);
    const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(
      results.violations.map((v) => `${v.id} [${v.impact}] ${v.help}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`),
      `accessibility violations on ${what} (${theme})`,
    ).toEqual([]);
  }
  await setTheme(page, "dark");
}

let school: TestTenant;
let admin: TestUser;
test.beforeAll(async () => {
  await seedInstance();
});
test.beforeEach(async ({ page }) => {
  school = await createTenant({ name: "Batch Line Academy", campuses: ["Alpha Campus"] });
  admin = await createUser();
  await addMembership(admin.id, school.id, Role.ADMIN);
  await signInThroughUi(page, admin);
  await waitForHydration(page);
});
test.afterEach(async () => {
  await removeCreatedTenants();
});

const bar = (page: Page) => page.getByRole("status").filter({ hasText: /Sending|All \d+ messages/ });
const open = async (page: Page) => {
  await page.goto(`/schools/${school.code}/communication`);
  await waitForHydration(page);
};

test("opening Communication with messages due carries on in the background, shows how far it got and says when all are sent", async ({
  page,
}) => {
  let calls = 0;
  await page.route(QUEUE, (route) => route.fulfill(json({ pending: 25 })));
  await page.route(NEXT, async (route) => {
    calls += 1;
    await new Promise((r) => setTimeout(r, 400));
    await route.fulfill(
      json({
        claimed: calls < 3 ? 10 : 5,
        sent: calls < 3 ? 10 : 5,
        failed: 0,
        retrying: 0,
        remaining: Math.max(0, 25 - calls * 10),
        firstError: null,
      }),
    );
  });
  await open(page);
  await expect(bar(page)).toContainText("Sending messages: 0 of 25");
  await expect(page.getByRole("progressbar", { name: "Messages sent" })).toBeVisible();
  await scan(page, "the sending progress");
  await expect(bar(page)).toContainText("All 25 messages were sent.");
  await scan(page, "the finished line");
  await page.getByRole("button", { name: "Dismiss" }).click();
  await expect(bar(page)).toHaveCount(0);
  expect(calls).toBe(3);
});

test("nothing due: no line is shown", async ({ page }) => {
  await page.route(QUEUE, (route) => route.fulfill(json({ pending: 0 })));
  await open(page);
  await expect(page.getByRole("tab", { name: "Broadcast Composer" })).toBeVisible();
  await expect(bar(page)).toHaveCount(0);
});

test("when the server cannot be reached the line says sending is paused, and Try again carries on; messages that failed are said not to be sent yet", async ({
  page,
}) => {
  let broken = true;
  await page.route(QUEUE, (route) => route.fulfill(json({ pending: 12 })));
  await page.route(NEXT, async (route) => {
    if (broken) return route.abort("failed");
    return route.fulfill(
      json({
        claimed: 12,
        sent: 9,
        failed: 0,
        retrying: 3,
        remaining: 0,
        firstError: "Text messages are not set up on this server (TERMII_API_KEY is not set). Nothing was sent.",
      }),
    );
  });
  await open(page);
  await expect(bar(page)).toContainText("Sending is paused at 0 of 12: the server could not be reached", { timeout: 15_000 });
  await scan(page, "the paused line");
  broken = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(bar(page)).toContainText("All 12 messages were handled: 9 sent, 3 not sent.");
  await expect(bar(page)).toContainText("TERMII_API_KEY");
  await scan(page, "the finished line with messages not sent");
});

test("when another screen is sending the rest, the line says so instead of blaming the server, and Try again checks again", async ({
  page,
}) => {
  // the server answers every call "nothing claimed, 8 due": another screen holds the rows (task 0059 fixes the wording: it said the server could not be reached)
  let released = false;
  await page.route(QUEUE, (route) => route.fulfill(json({ pending: 8 })));
  await page.route(NEXT, async (route) => {
    if (!released) return route.fulfill(json({ claimed: 0, sent: 0, failed: 0, retrying: 0, remaining: 8, firstError: null }));
    return route.fulfill(json({ claimed: 8, sent: 8, failed: 0, retrying: 0, remaining: 0, firstError: null }));
  });
  await open(page);
  await expect(bar(page)).toContainText("Sending is paused at 0 of 8: another screen is sending the rest", { timeout: 30_000 });
  await expect(bar(page)).not.toContainText("could not be reached");
  await scan(page, "the paused line while another screen sends");
  released = true;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(bar(page)).toContainText("All 8 messages were sent.");
});
