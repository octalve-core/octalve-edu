import "../support/env";
import { test, expect } from "@playwright/test";
import { seedInstance } from "../support/db";
import { api } from "../support/http";

// Broken percent-encoding in the path ("%ff", "%ED%A0%80", a lone "%") made Next answer a bare 500 ("Internal Server Error") for every dynamic route, a page or an API route,
// signed in or not, before any guard ran. The proxy (src/proxy.ts) refuses it first, as a 400. Over real HTTP, because the proxy's matcher has to cover the API for that to hold.

const BROKEN = [
  "/api/v1/verify/%ff",
  "/api/v1/verify-certificate/%ED%A0%80",
  "/api/v1/schools/s-x/announcements/%ff",
  "/api/v1/schools/%ff/announcements",
  "/api/v1/schools/s-x/announcements/%",
  "/api/v1/schools/s-x/announcements/%zz",
  "/schools/%ff",
  "/schools/%ED%A0%80/users",
];

test.beforeAll(async () => {
  await seedInstance(); // so /login doesn't bounce to /setup
});

test.describe("broken percent-encoding in the path", () => {
  for (const path of BROKEN) {
    test(`${path} is 400, uncacheable, with the baseline headers, and says nothing else`, async () => {
      const res = await api(path);
      expect(res.status).toBe(400);
      expect(res.text).toBe("Bad request");
      expect(res.headers.get("content-type")).toContain("text/plain");
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(res.headers.get("x-frame-options")).toBe("DENY");
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    });
  }
});

test.describe("what is well-formed still reaches the route", () => {
  test("an odd but valid encoding is answered by the route itself (its own JSON, its own words)", async () => {
    for (const path of ["/api/v1/verify/abc%20def", "/api/v1/verify/%F0%9F%98%80", "/api/v1/verify-certificate/%C3%A9"]) {
      const res = await api(path);
      expect(res.status, path).toBe(400);
      expect(res.json?.error?.code, path).toBe("INVALID_TOKEN");
    }
  });

  test("the API keeps its static policy (no page nonce), and a page still gets its own", async () => {
    const apiRes = await api("/api/v1/auth/me");
    expect(apiRes.status).toBe(401);
    expect(apiRes.headers.get("content-security-policy")).not.toContain("nonce-");
    const page = await api("/login");
    expect(page.status).toBe(200);
    expect(page.headers.get("content-security-policy")).toContain("nonce-");
  });
});
