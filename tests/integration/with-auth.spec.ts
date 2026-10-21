import { HTTP_PORT, HTTP_URL } from "../support/env";
import { NextRequest, NextResponse } from "next/server";
import { test, expect } from "@playwright/test";
import { NUL_MESSAGE } from "@/lib/api/no-nul";
import { withAuth } from "@/lib/auth/with-auth";
import { SESSION_COOKIE_NAME, createSession } from "@/lib/auth/session";
import { createUser } from "../support/db";

const APP = HTTP_URL;

function request(opts: { method?: string; origin?: string | null; token?: string; query?: string } = {}) {
  const headers: Record<string, string> = { "x-forwarded-host": `localhost:${HTTP_PORT}` };
  if (opts.origin !== null && opts.origin !== undefined) headers.origin = opts.origin;
  if (opts.token) headers.cookie = `${SESSION_COOKIE_NAME}=${opts.token}`;
  return new NextRequest(`${APP}/api/v1/thing${opts.query ? `?${opts.query}` : ""}`, { method: opts.method ?? "GET", headers });
}

function makeHandler() {
  const calls: { userId: string; ctx: unknown }[] = [];
  const route = withAuth<{ params: { id: string } }>(async (_req, auth, ctx) => {
    calls.push({ userId: auth.userId, ctx });
    return NextResponse.json({ ok: true });
  });
  return { route, calls };
}
const ctx = { params: { id: "42" } };
const codeOf = async (res: Response) => (await res.json()).error?.code;

test.describe("withAuth", () => {
  test("no session => 401 UNAUTHENTICATED and the handler never runs", async () => {
    const { route, calls } = makeHandler();
    const res = await route(request(), ctx);
    expect(res.status).toBe(401);
    expect(await codeOf(res)).toBe("UNAUTHENTICATED");
    expect(res.headers.get("cache-control")).toBe("no-store"); // refusals are uncacheable too
    expect(calls).toHaveLength(0);
  });

  test("an unknown/garbage token is also 401", async () => {
    const { route, calls } = makeHandler();
    const res = await route(request({ token: "f".repeat(64) }), ctx);
    expect(res.status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  test("valid session => handler runs with the resolved user and the route context", async () => {
    const user = await createUser();
    const { token } = await createSession(user.id);
    const { route, calls } = makeHandler();
    const res = await route(request({ token }), ctx);
    expect(res.status).toBe(200);
    expect(calls).toEqual([{ userId: user.id, ctx }]);
  });

  test("authenticated responses default to Cache-Control: private, no-store", async () => {
    const user = await createUser();
    const { token } = await createSession(user.id);
    const { route } = makeHandler();
    const res = await route(request({ token }), ctx);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  test("a handler that sets its own Cache-Control keeps it", async () => {
    const user = await createUser();
    const { token } = await createSession(user.id);
    const route = withAuth(async () => {
      const res = NextResponse.json({});
      res.headers.set("Cache-Control", "no-cache");
      return res;
    });
    const res = await route(request({ token }), undefined);
    expect(res.headers.get("cache-control")).toBe("no-cache");
  });

  test.describe("a NUL character in the address is refused for every route, before its handler (lib/api/no-nul.ts)", () => {
    const nul = String.fromCharCode(0);

    test("in a path segment: 404 NOT_FOUND, uncacheable, and the handler never runs", async () => {
      const user = await createUser();
      const { token } = await createSession(user.id);
      const { route, calls } = makeHandler();
      const contexts = [{ params: { id: `a${nul}b` } }, { params: Promise.resolve({ id: nul }) }, { params: { path: ["x", `y${nul}`] } }];
      for (const context of contexts) {
        const res = await route(request({ token }), context as never);
        expect(res.status).toBe(404);
        expect(await codeOf(res)).toBe("NOT_FOUND");
        expect(res.headers.get("cache-control")).toBe("no-store");
      }
      expect(calls).toHaveLength(0);
    });

    test("in the query string (a value, a key, one of several values): 400 VALIDATION naming the query, and the handler never runs", async () => {
      const user = await createUser();
      const { token } = await createSession(user.id);
      const { route, calls } = makeHandler();
      for (const query of ["q=a%00b", "q%00=1", "tag=ok&tag=x%00", "%00"]) {
        const res = await route(request({ token, query }), ctx);
        expect(res.status, query).toBe(400);
        const error = (await res.json()).error;
        expect(error.code).toBe("VALIDATION");
        expect(error.details).toEqual([{ path: "query", message: NUL_MESSAGE }]);
        expect(res.headers.get("cache-control")).toBe("no-store");
      }
      expect(calls).toHaveLength(0);
    });

    test("the usual refusals come first: signed out is 401, and a school the person is not in is 403, whatever the address holds", async () => {
      const { route, calls } = makeHandler();
      const signedOut = await route(request({ query: "q=a%00b" }), { params: { id: `a${nul}b` } } as never);
      expect(signedOut.status).toBe(401);

      const user = await createUser();
      const { token } = await createSession(user.id);
      const tenantRoute = withAuth(async () => NextResponse.json({ ok: true }), { tenant: true });
      const outsider = await tenantRoute(request({ token, query: "q=a%00b" }), {
        params: Promise.resolve({ code: "no-such-school", id: nul }),
      });
      expect(outsider.status).toBe(403);
      expect(calls).toHaveLength(0);
    });

    test("what only looks like one passes: the text of an escape, an encoded percent sign and 00, other control characters", async () => {
      const user = await createUser();
      const { token } = await createSession(user.id);
      const { route, calls } = makeHandler();
      const literalEscape = ["\\", "u0000"].join("");
      const res = await route(request({ token, query: "q=%5Cu0000&r=%2500&s=a%09b%0Ac" }), { params: { id: literalEscape } });
      expect(res.status).toBe(200);
      expect(calls).toHaveLength(1);
    });
  });

  test.describe("CSRF is enforced for every state-changing method, by the wrapper itself", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      test(`${method} without an Origin/Referer is rejected even with a valid session`, async () => {
        const user = await createUser();
        const { token } = await createSession(user.id);
        const { route, calls } = makeHandler();
        const res = await route(request({ method, token }), ctx);
        expect(res.status).toBe(403);
        expect(await codeOf(res)).toBe("CSRF");
        expect(res.headers.get("cache-control")).toBe("no-store");
        expect(calls).toHaveLength(0);
      });
    }

    test("a cross-origin Origin is rejected", async () => {
      const user = await createUser();
      const { token } = await createSession(user.id);
      const { route, calls } = makeHandler();
      const res = await route(request({ method: "POST", origin: "https://evil.example", token }), ctx);
      expect(res.status).toBe(403);
      expect(calls).toHaveLength(0);
    });

    test("a same-origin POST with a valid session goes through", async () => {
      const user = await createUser();
      const { token } = await createSession(user.id);
      const { route, calls } = makeHandler();
      const res = await route(request({ method: "POST", origin: APP, token }), ctx);
      expect(res.status).toBe(200);
      expect(calls).toHaveLength(1);
    });

    test("CSRF is checked BEFORE the session lookup (a forged request learns nothing about the session)", async () => {
      const { route } = makeHandler();
      const res = await route(request({ method: "POST", origin: "https://evil.example", token: "f".repeat(64) }), ctx);
      expect(res.status).toBe(403); // not 401
    });

    test("same-origin POST without a session is 401", async () => {
      const { route } = makeHandler();
      const res = await route(request({ method: "POST", origin: APP }), ctx);
      expect(res.status).toBe(401);
    });

    test("safe methods (GET/HEAD/OPTIONS) don't need an Origin", async () => {
      const user = await createUser();
      const { token } = await createSession(user.id);
      const { route } = makeHandler();
      for (const method of ["GET", "HEAD", "OPTIONS"]) {
        expect((await route(request({ method, token }), ctx)).status).toBe(200);
      }
    });
  });
});
