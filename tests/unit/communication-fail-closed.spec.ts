import "../support/env";
import { NotificationChannel } from "@prisma/client";
import { test, expect } from "@playwright/test";
import { notSetUp, standInAllowed } from "@/lib/communication/gateways/stand-in";
import { sendBatchEmails, sendEmail } from "@/lib/communication/gateways/email";
import { clearMockTermiiMessages, getMockTermiiMessages, sendTermiiMessage } from "@/lib/communication/gateways/termii";
import { defaultNotificationDispatcher } from "@/lib/communication/gateways/dispatcher";

// Task 0054: a send with no provider key is a failed send that says so, except where nothing real is expected to leave (the tests, the dev tools on). Before, every environment
// reported it as sent while nothing left the server. (Octalve queues its messages; whatever consumes the queue reaches these senders through the dispatcher.)

type Vars = Record<string, string | undefined>;

/// The environment of a production server with nothing configured, then `vars` on top. Restored afterwards, whatever happens.
async function withEnv<T>(vars: Vars, run: () => Promise<T>): Promise<T> {
  const env = process.env as Vars;
  const wanted: Vars = {
    NODE_ENV: "production",
    APP_ENV: undefined,
    VERCEL_ENV: undefined,
    DEV_TOOLS: undefined,
    DEV_TOOLS_TOKEN: undefined,
    RESEND_API_KEY: undefined,
    TERMII_API_KEY: undefined,
    ...vars,
  };
  const saved: Vars = {};
  for (const key of Object.keys(wanted)) saved[key] = env[key];
  const put = (all: Vars) => {
    for (const [key, value] of Object.entries(all)) {
      if (value === undefined) delete env[key];
      else env[key] = value;
    }
  };
  put(wanted);
  try {
    return await run();
  } finally {
    put(saved);
  }
}

async function withFetch<T>(answer: unknown, run: (calls: Array<{ url: string; authorization: string | null }>) => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  const calls: Array<{ url: string; authorization: string | null }> = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), authorization: new Headers(init?.headers).get("Authorization") });
    return new Response(JSON.stringify(answer), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    return await run(calls);
  } finally {
    globalThis.fetch = original;
  }
}

test.describe("standInAllowed: the stand-in is for tests and the dev tools only", () => {
  const rows: Array<[string, Vars, boolean]> = [
    ["the tests", { NODE_ENV: "test" }, true],
    ["a developer's machine (next dev, no APP_ENV)", { NODE_ENV: "development" }, true],
    ["a developer's machine with the dev tools switched off", { NODE_ENV: "development", DEV_TOOLS: "false" }, false],
    [
      "staging with the dev tools on and their token",
      { NODE_ENV: "production", APP_ENV: "staging", DEV_TOOLS: "true", DEV_TOOLS_TOKEN: "t" },
      true,
    ],
    ["staging with the dev tools on but no token", { NODE_ENV: "production", APP_ENV: "staging", DEV_TOOLS: "true" }, false],
    [
      "staging with the token but the dev tools not switched on",
      { NODE_ENV: "production", APP_ENV: "staging", DEV_TOOLS_TOKEN: "t" },
      false,
    ],
    ["production, nothing set", { NODE_ENV: "production" }, false],
    [
      "production with APP_ENV=production",
      { NODE_ENV: "production", APP_ENV: "production", DEV_TOOLS: "true", DEV_TOOLS_TOKEN: "t" },
      false,
    ],
    ["production with DEV_TOOLS=true and no APP_ENV", { NODE_ENV: "production", DEV_TOOLS: "true", DEV_TOOLS_TOKEN: "t" }, false],
    [
      "a Vercel production deploy that someone also called staging",
      { NODE_ENV: "production", VERCEL_ENV: "production", APP_ENV: "staging", DEV_TOOLS: "true", DEV_TOOLS_TOKEN: "t" },
      false,
    ],
    ["a mistyped APP_ENV", { NODE_ENV: "production", APP_ENV: "stagin", DEV_TOOLS: "true", DEV_TOOLS_TOKEN: "t" }, false],
  ];
  for (const [what, env, allowed] of rows) {
    test(`${what}: ${allowed ? "allowed" : "not allowed"}`, () => {
      expect(standInAllowed(env)).toBe(allowed);
    });
  }
});

test.describe("a production server with no provider key does not pretend to send", () => {
  test("email: a failed send that names the variable; the batch fails for every item, with the reason", async () => {
    const one = await withEnv({}, () => sendEmail({ to: "parent@example.com", subject: "Notice", body: "Hello" }));
    expect(one.success).toBe(false);
    expect(one.error).toBe(notSetUp("Email", "RESEND_API_KEY"));
    expect(one.error).toContain("Nothing was sent");
    expect(one.messageId).toBeUndefined();

    const batch = await withEnv({}, () =>
      sendBatchEmails([
        { to: "a@example.com", subject: "Notice", body: "Hello" },
        { to: "b@example.com", subject: "Notice", body: "Hello" },
      ]),
    );
    expect(batch.success).toBe(false);
    expect(batch.sentCount).toBe(0);
    expect(batch.errors).toEqual([notSetUp("Email", "RESEND_API_KEY"), notSetUp("Email", "RESEND_API_KEY")]);
  });

  test("SMS and WhatsApp: a failed send that names the channel and the variable, and nothing is recorded", async () => {
    clearMockTermiiMessages();
    const sms = await withEnv({}, () => sendTermiiMessage({ to: "08012345678", message: "Notice", channel: "generic" }));
    const whatsapp = await withEnv({}, () => sendTermiiMessage({ to: "08012345678", message: "Notice", channel: "whatsapp" }));
    expect(sms.success).toBe(false);
    expect(sms.error).toBe(notSetUp("SMS", "TERMII_API_KEY"));
    expect(whatsapp.success).toBe(false);
    expect(whatsapp.error).toBe(notSetUp("WhatsApp", "TERMII_API_KEY"));
    expect(getMockTermiiMessages()).toEqual([]);
  });

  test("the dispatcher reports the failure; the in-app channel needs no provider and is unaffected", async () => {
    const base = { dispatchId: "d1", tenantId: "t1", recipientAddress: "parent@example.com", subject: "Notice", body: "Hello" };
    const email = await withEnv({}, () => defaultNotificationDispatcher({ ...base, channel: NotificationChannel.EMAIL }));
    const sms = await withEnv({}, () =>
      defaultNotificationDispatcher({ ...base, channel: NotificationChannel.SMS, recipientAddress: "08012345678" }),
    );
    const inApp = await withEnv({}, () => defaultNotificationDispatcher({ ...base, channel: NotificationChannel.IN_APP }));
    expect(email.success).toBe(false);
    expect(email.error).toContain("RESEND_API_KEY");
    expect(sms.success).toBe(false);
    expect(sms.error).toContain("TERMII_API_KEY");
    expect(inApp.success).toBe(true);
  });

  test("an invalid address is still reported as an invalid address, not as a missing key", async () => {
    const res = await withEnv({}, () => sendEmail({ to: "not-an-address", subject: "Notice", body: "Hello" }));
    expect(res.success).toBe(false);
    expect(res.error).toContain("Invalid email address");
  });
});

test.describe("where a stand-in is allowed, or a key is set, behaviour is as it was", () => {
  test("staging with the dev tools on: the stand-in answers and says so", async () => {
    const res = await withEnv({ APP_ENV: "staging", DEV_TOOLS: "true", DEV_TOOLS_TOKEN: "t" }, () =>
      sendEmail({ to: "parent@example.com", subject: "Notice", body: "Hello" }),
    );
    expect(res.success).toBe(true);
    expect(res.messageId).toContain("resend-mock-");
  });

  test("production with a key: the provider is called with it, and its answer is the result", async () => {
    await withFetch({ id: "re_123" }, async (calls) => {
      const email = await withEnv({ RESEND_API_KEY: "re_test_key" }, () =>
        sendEmail({ to: "parent@example.com", subject: "Notice", body: "Hello" }),
      );
      expect(email.success).toBe(true);
      expect(email.messageId).toBe("re_123");
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe("https://api.resend.com/emails");
      expect(calls[0].authorization).toBe("Bearer re_test_key");
    });
  });
});
