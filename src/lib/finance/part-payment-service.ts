import { InvoiceStatus, Prisma } from "@prisma/client";
import type { TenantAuthContext } from "@/lib/auth/with-auth";
import type { Tx } from "@/lib/tenant/for-tenant";
import {
  DEFAULT_POLICY,
  describePolicy,
  minimumFor,
  PART_PAYMENT_KEY,
  effectivePolicy,
  parsePolicy,
  policyText,
  tighterThan,
  type EffectivePolicy,
  type PartPaymentPolicy,
} from "./part-payment";

// Part payment "if allowed" (task 0029): the stored policy (the school's and each campus's), the screen's view of it, who may change it, and the per-invoice "pay in full" flag.
// The rule itself is pure (part-payment.ts); this is the database side. The values live in `TenantSetting` (task 0027, slice P0): the school's has no campus, a campus's own has one.

type TenantCtx = TenantAuthContext["tenant"];

export type PolicyFailure = { ok: false; status: 400 | 403 | 404 | 409; code: string; message: string };
export type PolicyResult<T> = { ok: true; data: T } | PolicyFailure;
const refuse = (status: PolicyFailure["status"], code: string, message: string): PolicyFailure => ({ ok: false, status, code, message });

/// The policy that applies to a campus (or to a student with no campus: the school's alone) right now: the strictest of the school's and the campus's stored values. A value that
/// does not parse is ignored; nothing stored is the default, which is today's behaviour. Read on every payment, inside its transaction, so a change takes effect at once.
export async function loadEffectivePolicy(tx: Tx, tenantId: string, campusId: string | null): Promise<EffectivePolicy> {
  const rows = await tx.tenantSetting.findMany({
    where: { tenantId, key: PART_PAYMENT_KEY, OR: campusId ? [{ campusId: null }, { campusId }] : [{ campusId: null }] },
    orderBy: { updatedAt: "asc" },
    select: { campusId: true, value: true },
  });
  const school = rows.filter((row) => row.campusId === null).at(-1);
  const campus = rows.filter((row) => row.campusId !== null).at(-1);
  return effectivePolicy(school ? parsePolicy(school.value) : undefined, campus ? parsePolicy(campus.value) : undefined);
}

export type PolicyView = {
  school: { stored: PartPaymentPolicy | null; text: string };
  /// The school's administrator: every campus. A campus administrator: their own campus, to read.
  campuses: { id: string; name: string; stored: PartPaymentPolicy | null; text: string; canEdit: boolean }[];
  canEditSchool: boolean;
};

export async function policyView(tenant: TenantCtx): Promise<PolicyView> {
  const isAdmin = tenant.role === "ADMIN";
  return tenant.run(async (tx) => {
    const campuses = await tx.campus.findMany({
      where: { tenantId: tenant.tenantId, ...(isAdmin ? {} : { id: tenant.campusId ?? "" }) },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
    const rows = await tx.tenantSetting.findMany({
      where: {
        tenantId: tenant.tenantId,
        key: PART_PAYMENT_KEY,
        OR: [{ campusId: null }, { campusId: { in: campuses.map((c) => c.id) } }],
      },
      orderBy: { updatedAt: "asc" },
      select: { campusId: true, value: true },
    });
    const school = parsePolicy(rows.filter((row) => row.campusId === null).at(-1)?.value);
    const byCampus = new Map(rows.filter((row) => row.campusId !== null).map((row) => [row.campusId!, parsePolicy(row.value)]));
    return {
      school: { stored: school ?? null, text: policyText(effectivePolicy(school, undefined)) },
      campuses: campuses.map((campus) => ({
        id: campus.id,
        name: campus.name,
        stored: byCampus.get(campus.id) ?? null,
        text: policyText(effectivePolicy(school, byCampus.get(campus.id))),
        canEdit: isAdmin,
      })),
      canEditSchool: isAdmin,
    };
  });
}

export type SetPolicyInput = {
  actorUserId: string;
  scope: "SCHOOL" | "CAMPUS";
  campusId: string | null;
  /** null removes the stored value */ policy: PartPaymentPolicy | null;
  reason?: string | null;
};

/// The school's rule and a campus's stricter rule are the school administrator's alone: the rule is fee configuration, which ADR 0016 keeps from a campus administrator.
/// A campus's value may only be TIGHTER than the school's (task 0029, 3.2). `policy: null` removes the stored value. Saving what is already stored writes nothing. Every change
/// is audited, in the same transaction.
export async function setPolicy(tenant: TenantCtx, input: SetPolicyInput): Promise<PolicyResult<PolicyView>> {
  if (tenant.role !== "ADMIN") return refuse(403, "FORBIDDEN", "Only a school administrator can change the payment rules.");
  if (input.scope === "SCHOOL" && input.campusId) return refuse(400, "VALIDATION", "A school-wide change does not name a campus.");
  if (input.scope === "CAMPUS" && !input.campusId) return refuse(400, "VALIDATION", "A campus change needs the campus.");
  const { tenantId } = tenant;
  const campusId = input.scope === "SCHOOL" ? null : input.campusId;

  const outcome = await tenant.run(async (tx): Promise<PolicyResult<boolean>> => {
    // One change at a time per school: the stored values this validates against (and the old value the audit records) cannot move underneath it.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`finance:part-payment:${tenantId}`}))`;
    if (campusId !== null) {
      const campus = await tx.campus.findFirst({ where: { id: campusId, tenantId }, select: { id: true } });
      if (!campus) return refuse(404, "NOT_FOUND", "That campus was not found.");
    }
    if (campusId !== null && input.policy) {
      const school = await tx.tenantSetting.findFirst({
        where: { tenantId, campusId: null, key: PART_PAYMENT_KEY },
        orderBy: { updatedAt: "desc" },
        select: { value: true },
      });
      const problem = tighterThan(parsePolicy(school?.value) ?? DEFAULT_POLICY, input.policy);
      if (problem) return refuse(400, "VALIDATION", problem);
    }
    const existing = await tx.tenantSetting.findFirst({
      where: { tenantId, campusId, key: PART_PAYMENT_KEY },
      orderBy: { updatedAt: "desc" },
      select: { id: true, value: true },
    });
    const before = existing ? (parsePolicy(existing.value) ?? null) : null;
    if (JSON.stringify(before) === JSON.stringify(input.policy)) return { ok: true, data: false };
    if (input.policy === null) {
      await tx.tenantSetting.deleteMany({ where: { tenantId, campusId, key: PART_PAYMENT_KEY } });
    } else if (existing) {
      await tx.tenantSetting.update({ where: { id: existing.id }, data: { value: input.policy, updatedById: input.actorUserId } });
    } else {
      await tx.tenantSetting.create({
        data: { tenantId, campusId, key: PART_PAYMENT_KEY, value: input.policy, updatedById: input.actorUserId },
      });
    }
    await tx.auditLog.create({
      data: {
        tenantId,
        actorUserId: input.actorUserId,
        action: "PART_PAYMENT_SETTING_CHANGED",
        targetType: "TenantSetting",
        targetId: `${PART_PAYMENT_KEY}:${campusId ?? "school"}`,
        beforeValue: before === null ? Prisma.DbNull : (before as Prisma.InputJsonValue),
        afterValue: input.policy === null ? Prisma.DbNull : (input.policy as Prisma.InputJsonValue),
        reason: input.reason ?? null,
      },
    });
    return { ok: true, data: true };
  });
  if (!outcome.ok) return outcome;
  return { ok: true, data: await policyView(tenant) };
}

/// Marks one open invoice "pay in full" (or clears it). The school's administrator only (fee configuration, ADR 0016). It can only tighten what the policy says, never allow what
/// it forbids. Audited; saving the value already stored writes nothing. The row is locked while it is read and written, so a payment recorded at the same moment sees one or the other.
export async function setPayInFull(
  tenant: TenantCtx,
  actorUserId: string,
  invoiceId: string,
  payInFull: boolean,
): Promise<PolicyResult<{ payInFull: boolean }>> {
  if (tenant.role !== "ADMIN") return refuse(403, "FORBIDDEN", "Only a school administrator can change this.");
  const { tenantId } = tenant;
  return tenant.run(async (tx): Promise<PolicyResult<{ payInFull: boolean }>> => {
    await tx.$queryRaw`SELECT "id" FROM "Invoice" WHERE "tenantId" = ${tenantId} AND "id" = ${invoiceId} FOR UPDATE`;
    const invoice = await tx.invoice.findFirst({ where: { tenantId, id: invoiceId }, select: { id: true, status: true, payInFull: true } });
    if (!invoice) return refuse(404, "NOT_FOUND", "Invoice not found.");
    if (invoice.payInFull === payInFull) return { ok: true, data: { payInFull } };
    if (invoice.status !== InvoiceStatus.UNPAID && invoice.status !== InvoiceStatus.PARTIALLY_PAID)
      return refuse(409, "NOT_OPEN", "Only an invoice that still has a balance can be changed.");
    await tx.invoice.update({ where: { tenantId_id: { tenantId, id: invoice.id } }, data: { payInFull } });
    await tx.auditLog.create({
      data: {
        tenantId,
        actorUserId,
        action: "INVOICE_PAY_IN_FULL_CHANGED",
        targetType: "Invoice",
        targetId: invoice.id,
        beforeValue: { payInFull: invoice.payInFull },
        afterValue: { payInFull },
      },
    });
    return { ok: true, data: { payInFull } };
  });
}

/// What a screen says about one invoice: the sentence ("Part payments are allowed, at least ₦5,000." or "This invoice has to be paid in full."), the smallest part for this invoice
/// and the invoice's own flag. Read in the caller's transaction, with the same policy the payment paths enforce.
export async function partPaymentFor(
  tx: Tx,
  tenantId: string,
  invoice: { totalAmount: Prisma.Decimal; payInFull: boolean; student: { campusId: string | null } },
): Promise<{ text: string; minimum: string; payInFull: boolean }> {
  const policy = await loadEffectivePolicy(tx, tenantId, invoice.student.campusId);
  return {
    text: describePolicy(policy, invoice.totalAmount, invoice.payInFull),
    minimum: minimumFor(policy, invoice.totalAmount).toString(),
    payInFull: invoice.payInFull,
  };
}
