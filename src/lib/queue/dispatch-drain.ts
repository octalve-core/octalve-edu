import { NotificationDispatchStatus, type NotificationDispatch } from "@prisma/client";
import { prisma } from "../db";
import { forTenant } from "../tenant/for-tenant";
import { trustedTenantId } from "../tenant/verified-tenant";
import { defaultNotificationDispatcher } from "../communication/gateways/dispatcher";
import { processDispatchLifecycle, sanitizeErrorMessage, type DispatchHandler } from "./dispatch-lifecycle";
import { DEFAULT_DUE_POLICY, DISPATCH_MAX_ATTEMPTS, isDue, type DuePolicy } from "./dispatch-due";
import type { NotificationDispatchJobData } from "./definitions";

// Sends the queued messages (task 0057, option A of task 0054): the database row IS the queue, and a scheduler calls the route that calls this. It takes the due rows school by school and runs
// the existing dispatch lifecycle (dispatch-lifecycle.ts: PROCESSING, then SENT, RETRYING or FAILED, with the audit rows and the sanitised errors) on each.
//
// SCHOOLS AND RLS. There is no "every school" context in the row-level security, and a new policy would be a migration and a wider door. The `Tenant` table has no `tenantId` column (it IS the
// school), so it is outside RLS and can be listed; then each school's rows are read and written inside that school's own `forTenant` transaction. RLS is untouched.
//
// ONE RUN SENDS A ROW. A candidate is claimed with a compare-and-swap on (status, updatedAt): only the run that changes the row goes on to send it, so two runs that overlap (a retry by the
// scheduler, a call by hand) cannot send the same message. The claim moves `updatedAt`, which is where the lease of a PROCESSING row starts. Delivery is at-least-once: a run that dies after the
// provider accepted a message and before SENT is written sends it again once the lease has passed.
//
// ONE RUN IS BOUNDED, because a serverless function has a time limit and one school must not take a whole run: a time budget (no new row is claimed after it), a total number of rows, and a number
// of rows per school. What a run does not reach stays where it was and is taken by the next.

export interface DrainOptions {
  /// Visit only these schools (tests). The default is every school that is not suspended.
  tenantIds?: string[];
  /// What sends a message. The default is the real one: Resend, Termii, In-App.
  handler?: DispatchHandler;
  /// At most this many rows in one run (default 100).
  maxRows?: number;
  /// At most this many rows of one school in one run (default 20).
  perTenant?: number;
  /// No new row is claimed once this much time has passed (default 8000 ms: a short function is not cut off).
  budgetMs?: number;
  /// The attempts after which a message is dead-lettered (default 3).
  maxAttempts?: number;
  policy?: DuePolicy;
  /// The clock the run uses to decide what is due (tests).
  now?: () => Date;
}

export interface DrainReport {
  /// Schools visited.
  schools: number;
  /// Rows this run took and handled.
  claimed: number;
  sent: number;
  /// Failed this time and will be tried again.
  retrying: number;
  /// Dead-lettered this run (including the abandoned ones).
  failed: number;
  /// Rows given up on because the runs that took them kept dying: their attempts were used up.
  abandoned: number;
  /// Schools whose queue could not be read or written (the other schools are not affected).
  errors: number;
  /// The run stopped at a limit and there may be more to do.
  cut: boolean;
}

export const DEFAULT_MAX_ROWS = 100;
export const DEFAULT_PER_TENANT = 20;
export const DEFAULT_BUDGET_MS = 8_000;

export async function drainDispatchQueue(options: DrainOptions = {}): Promise<DrainReport> {
  const {
    handler = defaultNotificationDispatcher,
    maxRows = DEFAULT_MAX_ROWS,
    perTenant = DEFAULT_PER_TENANT,
    budgetMs = DEFAULT_BUDGET_MS,
    maxAttempts = DISPATCH_MAX_ATTEMPTS,
    policy = DEFAULT_DUE_POLICY,
    now = () => new Date(),
  } = options;
  const started = Date.now();
  const outOfTime = () => Date.now() - started >= budgetMs;
  const report: DrainReport = { schools: 0, claimed: 0, sent: 0, retrying: 0, failed: 0, abandoned: 0, errors: 0, cut: false };

  const schools = await prisma.tenant.findMany({
    where: { suspendedAt: null, ...(options.tenantIds ? { id: { in: options.tenantIds } } : {}) },
    select: { id: true },
    orderBy: { id: "asc" },
  });

  for (const school of schools) {
    if (report.claimed >= maxRows || outOfTime()) {
      report.cut = true;
      break;
    }
    report.schools += 1;
    try {
      const take = Math.min(perTenant, maxRows - report.claimed);
      const { rows, more } = await readDue(school.id, take, now(), policy);
      if (more) report.cut = true;
      for (const row of rows) {
        if (outOfTime()) {
          report.cut = true;
          break;
        }
        await handleRow(school.id, row, handler, maxAttempts, report);
      }
    } catch {
      // This school's queue could not be read or written; the other schools still get their turn. Nothing about the failure is returned: it would be a school's data in a response.
      report.errors += 1;
    }
  }
  return report;
}

type Row = NotificationDispatch;

/// The rows of one school that are due now, oldest first. The query keeps only the rows that could be due (a RETRYING row must have waited at least the first back-off, a PROCESSING row the
/// lease) and `isDue` makes the exact decision, since the back-off grows with the attempts.
async function readDue(tenantId: string, take: number, now: Date, policy: DuePolicy): Promise<{ rows: Row[]; more: boolean }> {
  const candidates = await forTenant(trustedTenantId(tenantId)).transaction((tx) =>
    tx.notificationDispatch.findMany({
      where: {
        tenantId,
        OR: [
          { status: NotificationDispatchStatus.QUEUED },
          { status: NotificationDispatchStatus.RETRYING, updatedAt: { lte: new Date(now.getTime() - policy.retryBaseMs) } },
          { status: NotificationDispatchStatus.PROCESSING, updatedAt: { lte: new Date(now.getTime() - policy.leaseMs) } },
        ],
      },
      orderBy: { createdAt: "asc" },
      take: take * 3 + 1,
    }),
  );
  const due = candidates.filter((row) => isDue(row, now, policy));
  return { rows: due.slice(0, take), more: due.length > take };
}

async function handleRow(tenantId: string, row: Row, handler: DispatchHandler, maxAttempts: number, report: DrainReport): Promise<void> {
  const school = forTenant(trustedTenantId(tenantId));

  // A row that was taken and not finished, as many times as it has attempts: the runs that took it keep dying (it may be what kills them). Give up on it rather than send it for ever.
  if (row.status === NotificationDispatchStatus.PROCESSING && row.attempts >= maxAttempts) {
    const reason = sanitizeErrorMessage(
      `Abandoned: the run that was sending this message did not finish, ${row.attempts} times. Nothing was confirmed as sent.`,
    );
    const gaveUp = await school.transaction(async (tx) => {
      const changed = await tx.notificationDispatch.updateMany({
        where: { id: row.id, tenantId, status: NotificationDispatchStatus.PROCESSING, updatedAt: row.updatedAt },
        data: { status: NotificationDispatchStatus.FAILED, lastError: reason },
      });
      if (changed.count !== 1) return false;
      await tx.notificationAuditLog.create({
        data: {
          tenantId,
          dispatchId: row.id,
          event: "DISPATCH_FAILED",
          channel: row.channel,
          recipient: row.recipientAddress,
          details: { attempts: row.attempts, error: reason },
        },
      });
      return true;
    });
    if (gaveUp) {
      report.claimed += 1;
      report.failed += 1;
      report.abandoned += 1;
    }
    return;
  }

  // The claim: only the run that changes the row sends it.
  const won = await school.transaction((tx) =>
    tx.notificationDispatch.updateMany({
      where: { id: row.id, tenantId, status: row.status, updatedAt: row.updatedAt },
      data: { status: NotificationDispatchStatus.PROCESSING },
    }),
  );
  if (won.count !== 1) return;
  report.claimed += 1;

  const job: NotificationDispatchJobData = {
    dispatchId: row.id,
    tenantId,
    channel: row.channel,
    recipientAddress: row.recipientAddress,
    recipientUserId: row.recipientUserId,
    subject: row.subject,
    body: row.body,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
  };
  try {
    await processDispatchLifecycle(job, handler, row.attempts, maxAttempts);
    report.sent += 1;
  } catch {
    // The lifecycle has already recorded the failure (RETRYING, or FAILED at the last attempt) and thrown so that a queue worker would retry; here the next run is the retry.
    if (row.attempts + 1 >= maxAttempts) report.failed += 1;
    else report.retrying += 1;
  }
}
