// The dev email inbox's store (domain-implementation-plan.md §0.5.F): the last 50 messages the `inbox` email
// transport "sent", newest first. It is a ring buffer in PROCESS MEMORY bound to `globalThis`, so Next's
// hot-module reloading — which re-evaluates modules and would reset a module-level array on every edit —
// doesn't empty it. Per process: right for a long-lived server (your machine, a Solo install, a single-instance
// staging); NOT shared across serverless instances.

export type DevEmail = { id: string; to: string; subject: string; text: string; sentAt: string };

export const MAX_DEV_EMAILS = 50;
/// A message body is capped, so a runaway loop can't turn the buffer into a memory leak.
export const MAX_DEV_EMAIL_TEXT = 20_000;

const holder = globalThis as unknown as { __devEmailInbox?: DevEmail[] };
const store = (): DevEmail[] => (holder.__devEmailInbox ??= []);

export function recordDevEmail(message: { to: string; subject: string; text: string }): DevEmail {
  const list = store();
  const email: DevEmail = {
    id: crypto.randomUUID(),
    to: message.to,
    subject: message.subject,
    text: message.text.length > MAX_DEV_EMAIL_TEXT ? `${message.text.slice(0, MAX_DEV_EMAIL_TEXT)}\n…[truncated]` : message.text,
    sentAt: new Date().toISOString(),
  };
  list.unshift(email);
  list.length = Math.min(list.length, MAX_DEV_EMAILS);
  return email;
}

/// Newest first. A copy: callers can't mutate the store.
export const getDevEmails = (): DevEmail[] => [...store()];

export function clearDevEmails(): void {
  store().length = 0;
}
