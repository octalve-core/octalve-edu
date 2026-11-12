import { NotificationDispatchStatus } from "@prisma/client";

// Which rows of the dispatch queue a run may take (task 0057). Pure, so that every boundary can be tested to the millisecond.
//
//   QUEUED       always due.
//   RETRYING     due once its back-off has passed: `retryBaseMs` after the first failed attempt, then doubling (BullMQ's back-off was 1 second doubling; a scheduler that runs every few
//                minutes cannot honour seconds).
//   PROCESSING   a run took it and has not finished: due again only when that run has had longer than the lease (it was probably killed mid-send). The lease is measured from `updatedAt`,
//                which the claim moves.
//   SENT, FAILED never.

export interface DuePolicy {
  /// How long a run may hold a PROCESSING row before another run may take it back.
  leaseMs: number;
  /// The back-off after the first failed attempt; it doubles with each further one.
  retryBaseMs: number;
}

export const DEFAULT_DUE_POLICY: DuePolicy = { leaseMs: 10 * 60 * 1000, retryBaseMs: 60 * 1000 };

/// The attempts after which a message is dead-lettered: the same 3 as `DEFAULT_DISPATCH_JOB_OPTIONS.attempts`.
export const DISPATCH_MAX_ATTEMPTS = 3;

export interface DueRow {
  status: NotificationDispatchStatus;
  /// Attempts made so far.
  attempts: number;
  updatedAt: Date;
}

/// The wait before the next attempt, after `attemptsMade` attempts have failed: base, 2 x base, 4 x base... (none made yet counts as the first wait).
export function retryDelayMs(attemptsMade: number, retryBaseMs: number = DEFAULT_DUE_POLICY.retryBaseMs): number {
  return retryBaseMs * 2 ** Math.max(0, attemptsMade - 1);
}

export function isDue(row: DueRow, now: Date, policy: DuePolicy = DEFAULT_DUE_POLICY): boolean {
  const idleMs = now.getTime() - row.updatedAt.getTime();
  switch (row.status) {
    case NotificationDispatchStatus.QUEUED:
      return true;
    case NotificationDispatchStatus.RETRYING:
      return idleMs >= retryDelayMs(row.attempts, policy.retryBaseMs);
    case NotificationDispatchStatus.PROCESSING:
      return idleMs >= policy.leaseMs;
    default:
      return false;
  }
}
