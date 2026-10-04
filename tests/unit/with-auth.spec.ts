import "../support/env";
import { test, expect } from "@playwright/test";
import { withAuth } from "@/lib/auth/with-auth";

// Role/permission gating is deliberately unavailable until §0.5.2: a role only
// means something against a specific verified tenant's membership, and a
// straight port of "any ADMIN row grants access" would let an ADMIN of school A
// through on school B's routes. It is a COMPILE error (see
// with-auth.types.ts) and, if someone bypasses the types, a throw at module load.
test.describe("withAuth fails closed on options that can't be evaluated safely yet", () => {
  const handler = async () => new Response("ok");

  test("`roles` throws at construction", () => {
    expect(() => withAuth(handler, { roles: ["ADMIN"] } as never)).toThrow(/§0\.5\.2/);
  });

  test("`permissions` throws at construction", () => {
    expect(() => withAuth(handler, { permissions: ["students:read"] } as never)).toThrow(/§0\.5\.2/);
  });

  test("even an empty `roles` array throws — the key's presence is what's refused", () => {
    expect(() => withAuth(handler, { roles: [] } as never)).toThrow();
  });

  test("no options is fine and yields a route handler", () => {
    expect(typeof withAuth(handler)).toBe("function");
  });
});
