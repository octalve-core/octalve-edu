import "../support/env";
import { test, expect } from "@playwright/test";
import { HTTP_URL, SAAS_URL } from "../support/env";
import { Role, createTenant, db, removeCreatedTenants, seedInstance } from "../support/db";
import { api } from "../support/http";
import { member } from "../support/qbank-world";
import { brand } from "@/lib/brand";

// What `/` answers (task 0041), over real HTTP and without a browser: a signed-out visitor is shown the landing page (a 200, not a redirect, and nothing set); a signed-in person is sent to the
// dashboard; a fresh Solo install is sent to its set-up wizard. The page is the same on the SaaS server and on a finished Solo one, and it is a page, not a router: it never answers with a
// `Location` to a signed-out visitor.
//
// `api()` sends the request exactly as written (no cookie jar, redirects not followed).

const SAAS = { baseUrl: SAAS_URL };
const SOLO = { baseUrl: HTTP_URL };

test.beforeAll(async () => {
  await seedInstance();
});
test.afterAll(async () => {
  await seedInstance(); // the set-up flag is put back for whatever runs next
  await removeCreatedTenants();
});

const h1s = (html: string) => [...html.matchAll(/<h1[\s>][\s\S]*?<\/h1>/g)].map((m) => m[0].replace(/<[^>]+>/g, "").trim());

test.describe("signed out", () => {
  for (const [name, opts] of [
    ["the SaaS server", SAAS],
    ["a finished Solo install", SOLO],
  ] as const) {
    test(`${name}: the landing page itself (200), with the headline, and not a redirect`, async () => {
      const res = await api("/", opts);
      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
      expect(res.headers.get("content-type")).toMatch(/text\/html/);
      expect(h1s(res.text)).toEqual([brand.landing.headline]);
      expect(res.text).toContain(brand.landing.coversHeading);
    });

    test(`${name}: it sets no cookie and writes nothing, and holds nothing that belongs to a school`, async () => {
      const before = await db.session.count();
      const res = await api("/", opts);
      expect(res.setCookies).toEqual([]);
      expect(await db.session.count()).toBe(before);
      expect(res.text).not.toMatch(/\/schools\/[a-z0-9-]+/); // no school address, not even in a link
    });
  }

  test("the two ways in are real links: /login and /verify, and nothing else leaves the page", async () => {
    const res = await api("/", SAAS);
    const hrefs = [...res.text.matchAll(/<a\s[^>]*href="([^"]*)"/g)].map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThanOrEqual(4);
    expect([...new Set(hrefs)].sort()).toEqual(["/login", "/verify"]);
    for (const path of ["/login", "/verify"]) expect((await api(path, SAAS)).status).toBe(200);
  });

  test("the tab and the description are the page's own, and it is open to search engines", async () => {
    const res = await api("/", SAAS);
    const html = res.text.replaceAll("&#x27;", "'"); // the page escapes an apostrophe in an attribute
    expect(html).toContain(`<title>${brand.landing.title}</title>`);
    expect(html).toContain(`name="description" content="${brand.landing.description}"`);
    expect(html).not.toMatch(/name="robots"[^>]*noindex/);
  });

  test("a forged or garbage session cookie is a signed-out visitor: the page, not an error and not a redirect", async () => {
    for (const cookie of ["session=not-a-real-token", "__Host-session=zzzz", "session="]) {
      const res = await api("/", { ...SAAS, cookie });
      expect(res.status, cookie).toBe(200);
      expect(res.headers.get("location"), cookie).toBeNull();
    }
  });
});

test.describe("signed in", () => {
  test("a person with a session is sent to the dashboard, and sees no landing page", async () => {
    const school = await createTenant({ name: "Landing School" });
    const admin = await member(school, Role.ADMIN, null, "Landing Admin");
    const res = await api("/", { ...SAAS, cookie: admin.cookie });
    expect([307, 308]).toContain(res.status);
    expect(new URL(res.headers.get("location")!, SAAS_URL).pathname).toBe("/dashboard");
    expect(res.text).not.toContain(brand.landing.coversHeading);
  });
});

test.describe("a fresh Solo install", () => {
  test("set-up not finished: sent to the wizard, as before; finished: the landing page", async () => {
    await db.systemSettings.update({ where: { id: "global" }, data: { setupComplete: false } });
    try {
      const res = await api("/", SOLO);
      expect([307, 308]).toContain(res.status);
      expect(new URL(res.headers.get("location")!, HTTP_URL).pathname).toBe("/setup");
    } finally {
      await seedInstance();
    }
    expect((await api("/", SOLO)).status).toBe(200);
  });

  test("the SaaS server never sends a visitor to the wizard, whatever the flag says (it is a Solo flag)", async () => {
    await db.systemSettings.update({ where: { id: "global" }, data: { setupComplete: false } });
    try {
      const res = await api("/", SAAS);
      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
    } finally {
      await seedInstance();
    }
  });
});
