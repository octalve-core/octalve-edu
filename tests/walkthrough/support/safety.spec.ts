import { test, expect } from "@playwright/test";
import {
  assertCurrentDatabase,
  assertLocalDatabaseHost,
  assertNoOtherConnections,
  assertWalkthroughDbName,
  generateSetupToken,
} from "../../../scripts/walkthrough-run/safety.mjs";

test.describe("The runner drops only a database it owns", () => {
  test("a walkthrough database is wip_<repo>_walkthrough and nothing else", () => {
    for (const ok of ["wip_aleemaan_walkthrough", "wip_octalve_edu_walkthrough", "wip_a1_walkthrough"])
      expect(assertWalkthroughDbName(ok)).toBe(ok);
    const refused = [
      "aleemaan_test",
      "aleemaan_dev",
      "aleemaan",
      "postgres",
      "template1",
      "wip_aleemaan",
      "aleemaan_walkthrough",
      "wip_aleemaan_test_walkthrough",
      "wip_aleemaan_dev_walkthrough",
      "wip_aleemaan_prod_walkthrough",
      "WIP_ALEEMAAN_WALKTHROUGH",
      "wip_has space_walkthrough",
      'wip_x"; drop database aleemaan_dev; --_walkthrough',
      "wip__walkthrough",
      "",
      undefined,
      null,
      42,
    ];
    for (const name of refused) expect(() => assertWalkthroughDbName(name), `accepted ${JSON.stringify(name)}`).toThrow(/Refusing/);
  });

  test("only a database on this machine", () => {
    for (const url of [
      "postgresql://u:p@localhost:5432/wip_a_walkthrough",
      "postgresql://u:p@127.0.0.1:5434/wip_a_walkthrough",
      "postgresql://u:p@[::1]:5432/wip_a_walkthrough",
    ]) {
      expect(() => assertLocalDatabaseHost(url), url).not.toThrow();
    }
    for (const url of [
      "postgresql://u:p@db.example.com:5432/x",
      "postgresql://u:p@ep-cool-123.neon.tech/x",
      "postgresql://u:p@10.0.0.5:5432/x",
      "postgresql://u:p@localhost.evil.example/x",
    ]) {
      expect(() => assertLocalDatabaseHost(url), url).toThrow(/only against a database on this machine/);
    }
  });

  test("current_database() must be the walkthrough database before the first write", () => {
    expect(() => assertCurrentDatabase("wip_a_walkthrough", "wip_a_walkthrough")).not.toThrow();
    expect(() => assertCurrentDatabase("wip_a_walkthrough", "aleemaan_dev")).toThrow(/Stopping before any write/);
  });

  test("a database with another connection is not dropped", () => {
    expect(() => assertNoOtherConnections(0, "wip_a_walkthrough")).not.toThrow();
    expect(() => assertNoOtherConnections("0", "wip_a_walkthrough")).not.toThrow();
    expect(() => assertNoOtherConnections(1, "wip_a_walkthrough")).toThrow(/will not drop a database in use/);
  });

  test("a setup token is random per run and long enough to be a secret", () => {
    const a = generateSetupToken();
    const b = generateSetupToken();
    expect(a).toMatch(/^[0-9a-f]{48}$/);
    expect(a).not.toBe(b);
  });
});
