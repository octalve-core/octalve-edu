import { NotificationDispatchStatus } from "@prisma/client";
import { test, expect } from "@playwright/test";
import { DEFAULT_DUE_POLICY, isDue, retryDelayMs } from "@/lib/queue/dispatch-due";

// Task 0057: which rows of the dispatch queue a run may take. A QUEUED row is always due; a RETRYING row once its back-off has passed (1 minute after the first failed attempt, doubling);
// a PROCESSING row only when the run that took it has had longer than the lease to finish (it was probably killed mid-send); SENT and FAILED are never due.

const NOW = new Date("2026-11-12T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const S = 1000;
const MIN = 60 * S;
const row = (status: NotificationDispatchStatus, attempts: number, updatedMsAgo: number) => ({
  status,
  attempts,
  updatedAt: ago(updatedMsAgo),
});

test.describe("the retry back-off", () => {
  test("1 minute after the first failed attempt, then doubling", () => {
    expect([1, 2, 3, 4].map((attempts) => retryDelayMs(attempts))).toEqual([1 * MIN, 2 * MIN, 4 * MIN, 8 * MIN]);
  });

  test("no attempts made yet is not a negative or a zero delay", () => {
    expect(retryDelayMs(0)).toBe(1 * MIN);
  });

  test("the base is an option", () => {
    expect(retryDelayMs(3, 10 * S)).toBe(40 * S);
  });
});

test.describe("which rows are due", () => {
  test("a QUEUED row is always due, however new", () => {
    expect(isDue(row(NotificationDispatchStatus.QUEUED, 0, 0), NOW)).toBe(true);
    expect(isDue(row(NotificationDispatchStatus.QUEUED, 0, 365 * 24 * 60 * MIN), NOW)).toBe(true);
  });

  test("a RETRYING row waits for its back-off, to the millisecond", () => {
    expect(isDue(row(NotificationDispatchStatus.RETRYING, 1, 1 * MIN - 1), NOW)).toBe(false);
    expect(isDue(row(NotificationDispatchStatus.RETRYING, 1, 1 * MIN), NOW)).toBe(true);
    expect(isDue(row(NotificationDispatchStatus.RETRYING, 2, 2 * MIN - 1), NOW)).toBe(false);
    expect(isDue(row(NotificationDispatchStatus.RETRYING, 2, 2 * MIN), NOW)).toBe(true);
    expect(isDue(row(NotificationDispatchStatus.RETRYING, 3, 4 * MIN - 1), NOW)).toBe(false);
  });

  test("a PROCESSING row belongs to the run that took it until the lease has passed", () => {
    expect(DEFAULT_DUE_POLICY.leaseMs).toBe(10 * MIN);
    expect(isDue(row(NotificationDispatchStatus.PROCESSING, 1, 10 * MIN - 1), NOW)).toBe(false);
    expect(isDue(row(NotificationDispatchStatus.PROCESSING, 1, 10 * MIN), NOW)).toBe(true);
    expect(isDue(row(NotificationDispatchStatus.PROCESSING, 1, 0), NOW)).toBe(false);
  });

  test("SENT and FAILED are never due, however old", () => {
    for (const status of [NotificationDispatchStatus.SENT, NotificationDispatchStatus.FAILED]) {
      expect(isDue(row(status, 3, 365 * 24 * 60 * MIN), NOW)).toBe(false);
    }
  });

  test("a row updated in the future (a clock that ran ahead) is not due, and does not throw", () => {
    expect(isDue(row(NotificationDispatchStatus.RETRYING, 1, -5 * MIN), NOW)).toBe(false);
    expect(isDue(row(NotificationDispatchStatus.PROCESSING, 1, -5 * MIN), NOW)).toBe(false);
  });

  test("the policy is an option", () => {
    const policy = { leaseMs: 1 * MIN, retryBaseMs: 10 * S };
    expect(isDue(row(NotificationDispatchStatus.PROCESSING, 1, 1 * MIN), NOW, policy)).toBe(true);
    expect(isDue(row(NotificationDispatchStatus.RETRYING, 2, 20 * S), NOW, policy)).toBe(true);
    expect(isDue(row(NotificationDispatchStatus.RETRYING, 2, 20 * S - 1), NOW, policy)).toBe(false);
  });
});
