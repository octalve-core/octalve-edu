import "../support/env";
import { test, expect } from "@playwright/test";
import { Role, createUser, uniqueEmail, uniqueIp } from "../support/db";
import { api, loginAs } from "../support/http";

const LOGIN = "/api/v1/auth/login";
const wrong = (email: string) => ({ email, password: "definitely-wrong-1" });

// Three layers (see the route): per-IP+email is HARD (5 failures), per-IP is
// loose (30), per-email across all IPs is only a SOFT flag. Only FAILED
// attempts count; a success hands back its own reservation.

test.describe("per IP + email (hard limit: 5 failures)", () => {
  test("the 6th attempt is refused with 429 — even with the CORRECT password — and sets no cookie", async () => {
    const user = await createUser();
    const ip = uniqueIp();
    for (let i = 0; i < 5; i++) {
      expect((await api(LOGIN, { body: wrong(user.email), ip })).status).toBe(401);
    }

    const blockedWrong = await api(LOGIN, { body: wrong(user.email), ip });
    expect(blockedWrong.status).toBe(429);
    expect(blockedWrong.json.error.code).toBe("RATE_LIMITED");
    expect(blockedWrong.headers.get("cache-control")).toBe("no-store");

    const blockedCorrect = await loginAs(user, { ip });
    expect(blockedCorrect.status).toBe(429);
    expect(blockedCorrect.setCookies).toHaveLength(0);
  });

  test("it is per account: the same IP can still sign in as someone else", async () => {
    const victim = await createUser();
    const other = await createUser();
    const ip = uniqueIp();
    for (let i = 0; i < 6; i++) await api(LOGIN, { body: wrong(victim.email), ip });
    expect((await loginAs(other, { ip })).status).toBe(200);
  });

  test("it is per IP: the real user, from their own IP, is not locked out by someone else's guessing", async () => {
    const victim = await createUser();
    const attackerIp = uniqueIp();
    for (let i = 0; i < 6; i++) await api(LOGIN, { body: wrong(victim.email), ip: attackerIp });
    expect((await api(LOGIN, { body: wrong(victim.email), ip: attackerIp })).status).toBe(429);

    expect((await loginAs(victim, { ip: uniqueIp() })).status).toBe(200);
  });

  test("successful logins are free: they don't consume the budget", async () => {
    const user = await createUser();
    const ip = uniqueIp();
    for (let i = 0; i < 4; i++) await api(LOGIN, { body: wrong(user.email), ip }); // 4 of 5 used
    for (let i = 0; i < 4; i++) expect((await loginAs(user, { ip })).status).toBe(200); // free
    expect((await api(LOGIN, { body: wrong(user.email), ip })).status).toBe(401); // the 5th failure
    expect((await api(LOGIN, { body: wrong(user.email), ip })).status).toBe(429); // now full
  });

  test("email case and whitespace can't be used to dodge the limit", async () => {
    const user = await createUser();
    const ip = uniqueIp();
    const variants = [user.email, user.email.toUpperCase(), ` ${user.email} `, user.email, user.email.toUpperCase()];
    for (const email of variants) await api(LOGIN, { body: wrong(email), ip });
    expect((await api(LOGIN, { body: wrong(user.email), ip })).status).toBe(429);
  });
});

test.describe("client IP: only the proxy-set header is believed", () => {
  test("a spoofed, ever-changing X-Forwarded-For does NOT evade the limit", async () => {
    const user = await createUser();
    const ip = uniqueIp(); // what the trusted proxy says
    for (let i = 0; i < 5; i++) {
      await api(LOGIN, { body: wrong(user.email), ip, headers: { "x-forwarded-for": `198.51.100.${i}, 203.0.113.${i}` } });
    }
    const res = await api(LOGIN, {
      body: wrong(user.email),
      ip,
      headers: { "x-forwarded-for": "192.0.2.250" },
    });
    expect(res.status).toBe(429);
  });

  test("changing the trusted X-Real-IP gives a fresh bucket (proves that header is the one honoured)", async () => {
    const user = await createUser();
    for (let i = 0; i < 6; i++) {
      const res = await api(LOGIN, { body: wrong(user.email), ip: uniqueIp() });
      expect(res.status).toBe(401); // never 429: every request looks like a new client
    }
  });

  test("with no IP header at all the server still answers normally (shared 'unproxied' bucket)", async () => {
    const res = await api(LOGIN, { body: wrong(uniqueEmail("noip")), ip: null });
    expect(res.status).toBe(401);
  });
});

test.describe("per IP, all accounts (loose limit: 30)", () => {
  test("30 failures from one IP across different accounts, then even a legitimate login from that IP is paused", async () => {
    test.setTimeout(180_000);
    const legit = await createUser();
    const ip = uniqueIp();

    for (let i = 0; i < 30; i++) {
      const res = await api(LOGIN, { body: wrong(uniqueEmail("spray")), ip });
      expect(res.status, `attempt ${i + 1}`).toBe(401);
    }
    const blocked = await loginAs(legit, { ip });
    expect(blocked.status).toBe(429);
    expect(blocked.json.error.code).toBe("RATE_LIMITED");

    // Another IP is unaffected.
    expect((await loginAs(legit, { ip: uniqueIp() })).status).toBe(200);
  });
});

test.describe("per account across all IPs (SOFT: flags, never blocks)", () => {
  test("after 10 failures from 10 different IPs a correct login still succeeds, and says accountThrottled", async () => {
    test.setTimeout(120_000);
    const user = await createUser({ role: Role.TEACHING_STAFF });

    for (let i = 0; i < 9; i++) await api(LOGIN, { body: wrong(user.email), ip: uniqueIp() });
    const before = await loginAs(user);
    expect(before.status).toBe(200);
    expect(before.json.data.accountThrottled).toBe(false);

    await api(LOGIN, { body: wrong(user.email), ip: uniqueIp() }); // the 10th failure
    const after = await loginAs(user);
    expect(after.status).toBe(200); // never a lock-out an attacker could weaponise
    expect(after.json.data.accountThrottled).toBe(true);
  });
});
