import "../support/env";
import { test, expect } from "@playwright/test";
import { createUser, uniqueEmail } from "../support/db";
import { api } from "../support/http";

// A missing account must cost as much as a wrong password. If the "no such
// user" path skipped bcrypt it would answer ~1000x faster than the wrong-
// password path, and response time alone would tell an attacker which emails
// are registered — even though both return the identical 401 body.
test("unknown account and wrong password take comparable time (no user-enumeration timing channel)", async () => {
  test.setTimeout(120_000);
  const user = await createUser();
  const body = (email: string) => ({ email, password: "definitely-wrong-1" });

  const timeOne = async (email: string) => {
    const started = performance.now();
    const res = await api("/api/v1/auth/login", { body: body(email) }); // fresh IP each call: no limiter interference
    expect(res.status).toBe(401);
    return performance.now() - started;
  };

  await timeOne(user.email); // warm-up: connection + JIT
  await timeOne(uniqueEmail("warm"));

  const known: number[] = [];
  const unknown: number[] = [];
  for (let i = 0; i < 8; i++) {
    known.push(await timeOne(user.email));
    unknown.push(await timeOne(uniqueEmail("ghost")));
  }
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const ratio = median(unknown) / median(known);

  test.info().annotations.push({
    type: "timing",
    description: `median wrong-password ${median(known).toFixed(0)}ms, unknown-account ${median(unknown).toFixed(0)}ms, ratio ${ratio.toFixed(2)}`,
  });
  // bcrypt (~hundreds of ms) dominates both paths; a skipped compare would give ratio ≈ 0.02.
  expect(ratio).toBeGreaterThan(0.5);
  expect(ratio).toBeLessThan(2);
  expect(median(unknown)).toBeGreaterThan(50); // and it really did the expensive work
});
