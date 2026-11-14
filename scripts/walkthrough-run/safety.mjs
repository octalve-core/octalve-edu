// Guards for the walkthrough runner. It DROPS AND RECREATES a database, so it may only ever touch one it owns: a name that says so, on this machine, with nothing else connected.
// Kept apart from run.mjs so that every rule is tested (tests/walkthrough/support/safety.spec.ts).

import crypto from "crypto";

/// wip_<something>_walkthrough: always wip_ first, always _walkthrough last. Lower case, digits and underscores only, so the name is also safe to put inside a SQL string.
export const DB_NAME_PATTERN = /^wip_[a-z0-9_]{1,40}_walkthrough$/;

export function assertWalkthroughDbName(name) {
  if (typeof name !== "string" || !DB_NAME_PATTERN.test(name)) {
    throw new Error(
      `Refusing to touch database "${String(name).slice(0, 80)}": a walkthrough database is named wip_<repo>_walkthrough (lower case, digits, underscores).`,
    );
  }
  if (name.includes("_test") || name.includes("_dev") || name.includes("_prod")) {
    throw new Error(`Refusing database "${name}": a walkthrough database is never a test, dev or production database.`);
  }
  return name;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/// Nothing may leave this machine, and a remote database is somebody's data: only a local server.
export function assertLocalDatabaseHost(databaseUrl) {
  const host = new URL(databaseUrl).hostname;
  if (!LOCAL_HOSTS.has(host))
    throw new Error(`Refusing database host "${host}": the walkthrough runs only against a database on this machine.`);
  return host;
}

/// `select current_database()` must return the walkthrough database, before the first write, every time.
export function assertCurrentDatabase(expected, actual) {
  if (expected !== actual) throw new Error(`current_database() is "${actual}", expected "${expected}". Stopping before any write.`);
}

/// Another connection means somebody is using it: drop only a database nobody is connected to.
export function assertNoOtherConnections(count, name) {
  if (Number(count) !== 0)
    throw new Error(
      `Database "${name}" has ${count} open connection(s). Stopping: close them first, the runner will not drop a database in use.`,
    );
}

/// The deployment setup token of one run: 24 random bytes, known to the runner and the server's environment, never printed.
export function generateSetupToken() {
  return crypto.randomBytes(24).toString("hex");
}
