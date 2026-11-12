import { devToolsEnabled } from "@/lib/dev-tools";

// May a missing provider key (RESEND_API_KEY, TERMII_API_KEY) be covered by the in-memory stand-in, which records the message and reports success while nothing leaves the machine?
// Only where nothing real is expected to leave: the tests, and a build with the dev tools on (a developer's own machine, or a staging build with DEV_TOOLS=true and its token).
// Production never, whatever DEV_TOOLS says: a message that goes nowhere must not be recorded as sent (task 0054). A pure function of the environment, so the whole matrix is unit-tested.

type Env = Record<string, string | undefined>;

export function standInAllowed(env: Env = process.env): boolean {
  return env.NODE_ENV === "test" || devToolsEnabled(env);
}

/// The sentence a failed send carries when the provider is not set up. It names the variable and never a value; it becomes the dispatch's `lastError`, which the log shows.
export function notSetUp(what: string, variable: string): string {
  return `${what} is not set up on this server (${variable} is not set). Nothing was sent.`;
}
