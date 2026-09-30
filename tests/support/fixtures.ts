import "./env"; // must stay first: points DATABASE_URL at the test database
import { test as base, expect } from "@playwright/test";
import { uniqueIp } from "./db";

type Fixtures = {
  /// A client IP unique to this test. Sent as X-Real-IP (the header the servers
  /// under test trust for rate limiting) so tests can't exhaust each other's
  /// buckets. `x-test-client-ip` is the same value for the TLS proxy, which
  /// overwrites x-real-ip itself and promotes this header instead.
  clientIp: string;
};

export const test = base.extend<Fixtures>({
  // (The callback is named `provide`, not Playwright's usual `use`, because
  // eslint-plugin-react-hooks mistakes anything called `use(...)` for React's hook.)
  clientIp: async ({}, provide) => {
    await provide(uniqueIp());
  },
  context: async ({ context, clientIp }, provide) => {
    await context.setExtraHTTPHeaders({ "x-real-ip": clientIp, "x-test-client-ip": clientIp });
    await provide(context);
  },
});

export { expect };
