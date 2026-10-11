import "../support/env";
import { test, expect } from "@playwright/test";
import { MOCK_PAYSTACK_SECRET, resolvePaystackMode } from "@/lib/finance/paystack";

// plan "Fix design - Phase 1 review findings", F3 and amendment F3a: what payment mode a server is in is ONE pure function of its
// environment. The public mock secret must never be reachable in a real deployment.

const prod = { APP_ENV: "production" } as const;

test.describe("resolvePaystackMode", () => {
  test("production with a key is real", () => {
    expect(resolvePaystackMode({ ...prod, PAYSTACK_SECRET_KEY: "sk_live_x" })).toEqual({ kind: "real", secret: "sk_live_x" });
  });

  test("production without a key is not configured - never the mock", () => {
    expect(resolvePaystackMode({ ...prod })).toEqual({ kind: "not-configured" });
    expect(resolvePaystackMode({ ...prod, FORCE_MOCK_PAYSTACK: "true" })).toMatchObject({ kind: "not-configured" });
  });

  test("production with FORCE_MOCK_PAYSTACK alone is refused, even with a key", () => {
    expect(resolvePaystackMode({ ...prod, FORCE_MOCK_PAYSTACK: "true", PAYSTACK_SECRET_KEY: "sk_live_x" })).toEqual({
      kind: "mock-refused",
    });
  });

  test("production with both switches (the test harness) is mock, signing with the key it was given", () => {
    expect(
      resolvePaystackMode({
        ...prod,
        FORCE_MOCK_PAYSTACK: "true",
        ALLOW_MOCK_PAYMENTS_IN_PRODUCTION: "true",
        PAYSTACK_SECRET_KEY: "sk_test_k",
      }),
    ).toEqual({ kind: "mock", secret: "sk_test_k" });
    // the second switch alone changes nothing
    expect(resolvePaystackMode({ ...prod, ALLOW_MOCK_PAYMENTS_IN_PRODUCTION: "true", PAYSTACK_SECRET_KEY: "sk_live_x" })).toEqual({
      kind: "real",
      secret: "sk_live_x",
    });
  });

  test("a mistyped APP_ENV means production (fail closed)", () => {
    expect(resolvePaystackMode({ APP_ENV: "prodction" })).toEqual({ kind: "not-configured" });
  });

  test("development and staging: no key means mock with the one public mock secret; a key means real; FORCE_MOCK_PAYSTACK forces mock", () => {
    for (const APP_ENV of ["development", "staging"]) {
      expect(resolvePaystackMode({ APP_ENV })).toEqual({ kind: "mock", secret: MOCK_PAYSTACK_SECRET });
      expect(resolvePaystackMode({ APP_ENV, PAYSTACK_SECRET_KEY: "sk_test_k" })).toEqual({ kind: "real", secret: "sk_test_k" });
      expect(resolvePaystackMode({ APP_ENV, PAYSTACK_SECRET_KEY: "sk_test_k", FORCE_MOCK_PAYSTACK: "true" })).toEqual({
        kind: "mock",
        secret: "sk_test_k",
      });
    }
  });

  test("a blank key counts as no key", () => {
    expect(resolvePaystackMode({ ...prod, PAYSTACK_SECRET_KEY: "   " })).toEqual({ kind: "not-configured" });
  });
});
