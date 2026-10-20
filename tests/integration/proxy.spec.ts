import "../support/env";
import { test, expect } from "@playwright/test";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

// proxy.ts called in-process: what it puts on the RESPONSE (what the browser enforces) and on the
// REQUEST (what Next reads the nonce from while rendering — without it Next's own scripts carry no
// nonce and the policy blocks the app).

const call = () => proxy(new NextRequest("http://localhost/login"));
const nonceOf = (policy: string) => policy.match(/'nonce-([^']+)'/)![1];

test.describe.configure({ mode: "serial" });

test("the response carries the policy, with a fresh nonce on every call", () => {
  const nonces = new Set<string>();
  for (let i = 0; i < 50; i++) {
    const policy = call().headers.get("content-security-policy")!;
    expect(policy).toContain("script-src 'self'");
    nonces.add(nonceOf(policy));
  }
  expect(nonces.size).toBe(50);
});

test("the SAME policy (same nonce) is forwarded on the request headers, where Next reads it", () => {
  const res = call();
  const forwarded = res.headers.get("x-middleware-request-content-security-policy");
  expect(forwarded).toBe(res.headers.get("content-security-policy"));
  expect(res.headers.get("x-middleware-override-headers")).toContain("content-security-policy");
});

test("CSP_REPORT_ONLY=true switches the header NAME (response and request) and nothing else", () => {
  const before = process.env.CSP_REPORT_ONLY;
  process.env.CSP_REPORT_ONLY = "true";
  try {
    const res = call();
    expect(res.headers.get("content-security-policy")).toBeNull();
    const policy = res.headers.get("content-security-policy-report-only")!;
    expect(policy).toContain("script-src 'self'");
    expect(res.headers.get("x-middleware-request-content-security-policy-report-only")).toBe(policy);
  } finally {
    if (before === undefined) delete process.env.CSP_REPORT_ONLY;
    else process.env.CSP_REPORT_ONLY = before;
  }
});

test("only the exact value 'true' relaxes it: anything else stays enforcing", () => {
  const before = process.env.CSP_REPORT_ONLY;
  try {
    for (const value of ["1", "TRUE", "yes", "false", ""]) {
      process.env.CSP_REPORT_ONLY = value;
      expect(call().headers.get("content-security-policy"), value).toContain("script-src");
    }
  } finally {
    if (before === undefined) delete process.env.CSP_REPORT_ONLY;
    else process.env.CSP_REPORT_ONLY = before;
  }
});

test.describe("broken percent-encoding in the path is a 400, not Next's 500", () => {
  const at = (path: string) => proxy(new NextRequest(`http://localhost${path}`));

  test("pages and the API both refuse it, uncacheable, without leaking anything", () => {
    for (const path of [
      "/login%ff",
      "/schools/%ED%A0%80",
      "/api/v1/verify/%ff",
      "/api/v1/schools/s-x/announcements/a%C0%80b",
      "/api/x/%",
      "/api/x/%zz",
    ]) {
      const res = at(path);
      expect(res.status, path).toBe(400);
      expect(res.headers.get("cache-control"), path).toBe("no-store");
      expect(res.headers.get("content-security-policy"), path).toBeNull();
    }
  });

  test("well-formed encodings, including a NUL byte and emoji, go on to the route (which answers them itself)", () => {
    for (const path of ["/login", "/api/v1/verify/%00", "/api/v1/verify/%F0%9F%98%80", "/schools/abc%20def", "/api/v1/x/%2F%2E%2E"]) {
      expect(at(path).status, path).toBe(200);
    }
  });

  test("an API request passes through without a page policy; a page request still gets one", () => {
    expect(at("/api/v1/auth/me").headers.get("content-security-policy")).toBeNull();
    expect(at("/login").headers.get("content-security-policy")).toContain("script-src");
  });
});
