import type { Prisma } from "@prisma/client";
import type { TenantAuthContext } from "@/lib/auth/with-auth";
import type { Tx } from "@/lib/tenant/for-tenant";
import { guardiansVisibleTo } from "@/lib/people/guardians";
import { ACCOUNT_ROLE, ACCOUNT_SELECT, toPersonAccount, type AccountKind, type PersonAccount } from "@/lib/people/person-account";
import { auditPeople, refuse, refuseAndRollBack, rollingBack, type PeopleResult } from "@/lib/people/results";
import { studentsVisibleTo } from "@/lib/people/students";

// Linking a pupil's or a guardian's sign-in account to their record (task 0065), the way a staff record is linked (`lib/people/staff.ts`): the account is made on the Users page (an invitation with
// the role Student or Parent); here the school says whose it is. The portal finds a pupil by `StudentRecord.userId` and a guardian's children by `GuardianRecord.userId`, and nothing else sets them.
// One account per record and one record per account in a school, by the partial unique indexes `StudentRecord_account_once` and `GuardianRecord_account_once`; the checks below say it in words first.

type TenantCtx = TenantAuthContext["tenant"];

export type LinkableAccount = { userId: string; name: string | null; email: string | null };

const SPEC = {
  student: { target: "StudentRecord", linked: "STUDENT_ACCOUNT_LINKED", unlinked: "STUDENT_ACCOUNT_UNLINKED" },
  guardian: { target: "GuardianRecord", linked: "GUARDIAN_ACCOUNT_LINKED", unlinked: "GUARDIAN_ACCOUNT_UNLINKED" },
} as const;

/// The record, if this member may see it (a campus administrator: their campus's pupils, and the guardians of their campus's pupils).
async function findRecord(tx: Tx, tenant: TenantCtx, kind: AccountKind, id: string) {
  const select = { id: true, userId: true, archivedAt: true } as const;
  return kind === "student"
    ? tx.studentRecord.findFirst({ where: { id, tenantId: tenant.tenantId, ...studentsVisibleTo(tenant) }, select })
    : tx.guardianRecord.findFirst({ where: { id, tenantId: tenant.tenantId, ...guardiansVisibleTo(tenant) }, select });
}

/// Serialises the links of one kind in a school (the check that the account is free, then the write).
async function lockLinks(tx: Tx, tenantId: string, kind: AccountKind) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`account-link:${kind}:${tenantId}`}::text))`;
}

/// A campus administrator chooses among their own campus's members; a school administrator among everyone's.
const campusRule = (tenant: TenantCtx): Prisma.TenantMembershipWhereInput =>
  tenant.role === "CAMPUS_ADMIN" ? { campusId: tenant.campusId } : {};

/// The active members of this school who hold the role that fits the kind of record and have no record of that kind yet (at most 200): the choices for "Link account".
export async function linkableAccounts(
  tenant: TenantCtx,
  kind: AccountKind,
  recordId: string,
): Promise<PeopleResult<{ accounts: LinkableAccount[] }>> {
  return tenant.run(async (tx) => {
    const record = await findRecord(tx, tenant, kind, recordId);
    if (!record) return refuse("NOT_FOUND");
    const members = await tx.tenantMembership.findMany({
      where: {
        tenantId: tenant.tenantId,
        deactivatedAt: null,
        role: ACCOUNT_ROLE[kind],
        ...(kind === "student" ? { studentRecords: { none: {} } } : { guardianRecords: { none: {} } }),
        ...campusRule(tenant),
      },
      select: { userId: true, user: { select: { name: true, email: true } } },
      orderBy: [{ user: { name: "asc" } }, { userId: "asc" }],
      take: 200,
    });
    return { ok: true, accounts: members.map((m) => ({ userId: m.userId, name: m.user.name, email: m.user.email })) };
  });
}

/// Links a record to an existing member of this school. Conditional (`userId IS NULL`), so two administrators linking at once make one link.
export async function linkAccount(
  tenant: TenantCtx,
  actorUserId: string,
  kind: AccountKind,
  recordId: string,
  input: { userId: string },
): Promise<PeopleResult<{ account: PersonAccount }>> {
  const { tenantId } = tenant;
  const spec = SPEC[kind];
  return rollingBack(() =>
    tenant.run(async (tx) => {
      const record = await findRecord(tx, tenant, kind, recordId);
      if (!record) return refuse("NOT_FOUND");
      if (record.archivedAt) return refuse("ARCHIVED");
      if (record.userId) return refuse("ALREADY_LINKED_ACCOUNT", { kind });
      await lockLinks(tx, tenantId, kind);
      const member = await tx.tenantMembership.findFirst({
        where: { tenantId, userId: input.userId, deactivatedAt: null, ...campusRule(tenant) },
        select: { role: true },
      });
      if (!member || member.role !== ACCOUNT_ROLE[kind]) return refuse("ACCOUNT_MISMATCH", { kind });
      const taken =
        kind === "student"
          ? await tx.studentRecord.findFirst({ where: { tenantId, userId: input.userId }, select: { id: true } })
          : await tx.guardianRecord.findFirst({ where: { tenantId, userId: input.userId }, select: { id: true } });
      if (taken) return refuse("ACCOUNT_TAKEN", { kind });
      try {
        const where = { id: recordId, tenantId, userId: null, archivedAt: null };
        const done =
          kind === "student"
            ? await tx.studentRecord.updateMany({ where, data: { userId: input.userId } })
            : await tx.guardianRecord.updateMany({ where, data: { userId: input.userId } });
        if (done.count !== 1) return refuseAndRollBack("ALREADY_LINKED_ACCOUNT", { kind });
      } catch (error) {
        // The partial unique index is the net under the check above: a collision it still catches (a link made by another request in between) is the same answer, not a 500.
        if (typeof error === "object" && error && (error as { code?: string }).code === "P2002")
          return refuseAndRollBack("ACCOUNT_TAKEN", { kind });
        throw error;
      }
      await auditPeople(tx, tenantId, actorUserId, spec.target, spec.linked, recordId, undefined, { userId: input.userId });
      const membership = await tx.tenantMembership.findFirstOrThrow({ where: { tenantId, userId: input.userId }, select: ACCOUNT_SELECT });
      return { ok: true as const, account: toPersonAccount(kind, input.userId, membership) };
    }),
  );
}

/// Clears the link (the account and its membership are untouched). A record with no account answers NOT_LINKED.
export async function unlinkAccount(
  tenant: TenantCtx,
  actorUserId: string,
  kind: AccountKind,
  recordId: string,
): Promise<PeopleResult<{ account: PersonAccount }>> {
  const { tenantId } = tenant;
  const spec = SPEC[kind];
  return rollingBack(() =>
    tenant.run(async (tx) => {
      const record = await findRecord(tx, tenant, kind, recordId);
      if (!record) return refuse("NOT_FOUND");
      if (!record.userId) return refuse("NOT_LINKED", { kind });
      await lockLinks(tx, tenantId, kind);
      const was = record.userId;
      const where = { id: recordId, tenantId, userId: was };
      const done =
        kind === "student"
          ? await tx.studentRecord.updateMany({ where, data: { userId: null } })
          : await tx.guardianRecord.updateMany({ where, data: { userId: null } });
      if (done.count !== 1) return refuseAndRollBack("NOT_LINKED", { kind });
      await auditPeople(tx, tenantId, actorUserId, spec.target, spec.unlinked, recordId, { userId: was });
      return { ok: true as const, account: { state: "none" } as PersonAccount };
    }),
  );
}
