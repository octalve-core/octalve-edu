import { Prisma } from "@prisma/client";
import type { TenantAuthContext } from "@/lib/auth/with-auth";
import type { Tx } from "@/lib/tenant/for-tenant";
import { effectiveSwitch, parseSwitch } from "./ceiling-rules";

export { effectiveSwitch, parseSwitch };

// A yes/no setting under the ceiling rule (tasks 0027 and 0028): the SCHOOL's value is the ceiling and a CAMPUS can only narrow it, so something is on for a campus only when BOTH
// are on, and nothing stored means "on". Stored in `TenantSetting` (the school's value has no campus), every change audited in the same transaction. Used by `programs.enabled`
// and `standing.campusAdminMaySuspend`; a new switch is a key and an audit action, not a copy of this file. A change of the SCHOOL's value is the school administrator's alone (and
// the route asks for a fresh proof); a campus's own value is also an administrator's, and can only turn it OFF.

type TenantCtx = TenantAuthContext["tenant"];

export type SwitchFailure = { ok: false; status: 400 | 403 | 404 | 409; code: string; message: string };
export type SwitchResult<T> = { ok: true; data: T } | SwitchFailure;
const refuse = (status: SwitchFailure["status"], code: string, message: string): SwitchFailure => ({ ok: false, status, code, message });

export type SwitchesView = {
  /// What the school stored (null = nothing, which means on) and what applies.
  school: { stored: boolean | null; effective: boolean };
  /// The school's administrator: every campus. A campus administrator: their own campus, to read.
  campuses: { id: string; name: string; stored: boolean | null; effective: boolean; canEdit: boolean }[];
  canEditSchool: boolean;
};

export type SetSwitchInput = {
  actorUserId: string;
  scope: "SCHOOL" | "CAMPUS";
  campusId: string | null;
  enabled: boolean | null;
  reason?: string | null;
};

export function ceilingSwitch(definition: { key: string; auditAction: string }) {
  const { key, auditAction } = definition;

  /// What is stored for the school and for each of the given campuses (undefined = nothing stored = on).
  async function stored(
    tx: Tx,
    tenantId: string,
    campusIds: readonly string[],
  ): Promise<{ school: boolean | undefined; campus: Map<string, boolean | undefined> }> {
    const rows = await tx.tenantSetting.findMany({
      where: { tenantId, key, OR: [{ campusId: null }, ...(campusIds.length > 0 ? [{ campusId: { in: [...campusIds] } }] : [])] },
      orderBy: { updatedAt: "asc" },
      select: { campusId: true, value: true },
    });
    const campus = new Map<string, boolean | undefined>();
    let school: boolean | undefined;
    for (const row of rows) {
      if (row.campusId === null) school = parseSwitch(row.value);
      else campus.set(row.campusId, parseSwitch(row.value));
    }
    return { school, campus };
  }

  /// Whether a student or member of this campus (null: the school's own) has it on right now: the school's value AND the campus's own.
  async function onFor(tx: Tx, tenantId: string, campusId: string | null): Promise<boolean> {
    const { school, campus } = await stored(tx, tenantId, campusId ? [campusId] : []);
    return effectiveSwitch(school, campusId ? campus.get(campusId) : undefined);
  }

  async function view(tenant: TenantCtx): Promise<SwitchesView> {
    const isAdmin = tenant.role === "ADMIN";
    return tenant.run(async (tx) => {
      const campuses = await tx.campus.findMany({
        where: { tenantId: tenant.tenantId, ...(isAdmin ? {} : { id: tenant.campusId ?? "" }) },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      });
      const { school, campus } = await stored(
        tx,
        tenant.tenantId,
        campuses.map((c) => c.id),
      );
      return {
        school: { stored: school ?? null, effective: school ?? true },
        campuses: campuses.map((c) => ({
          id: c.id,
          name: c.name,
          stored: campus.get(c.id) ?? null,
          effective: effectiveSwitch(school, campus.get(c.id)),
          canEdit: isAdmin || tenant.campusId === c.id,
        })),
        canEditSchool: isAdmin,
      };
    });
  }

  /// The school's value: the school's administrator. A campus's value: the school's administrator or that campus's administrator, and only to turn it OFF (storing "on" while the
  /// school has it off is refused). `enabled: null` removes the stored value. Saving the value that is already stored writes nothing.
  async function set(tenant: TenantCtx, input: SetSwitchInput): Promise<SwitchResult<SwitchesView>> {
    const isAdmin = tenant.role === "ADMIN";
    if (input.scope === "SCHOOL" && !isAdmin)
      return refuse(403, "FORBIDDEN", "Only a school administrator can change the school's setting.");
    if (input.scope === "SCHOOL" && input.campusId) return refuse(400, "VALIDATION", "A school-wide change does not name a campus.");
    if (input.scope === "CAMPUS" && !input.campusId) return refuse(400, "VALIDATION", "A campus change needs the campus.");
    if (input.scope === "CAMPUS" && !isAdmin) {
      if (tenant.role !== "CAMPUS_ADMIN" || tenant.campusId === null)
        return refuse(403, "FORBIDDEN", "Only an administrator can change this setting.");
      // another campus answers like one that does not exist
      if (input.campusId !== tenant.campusId) return refuse(404, "NOT_FOUND", "That campus was not found.");
    }
    const { tenantId } = tenant;
    const campusId = input.scope === "SCHOOL" ? null : input.campusId;
    const outcome = await tenant.run(async (tx): Promise<SwitchResult<boolean>> => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`switch:${key}:${tenantId}`}))`;
      if (campusId !== null && !(await tx.campus.findFirst({ where: { id: campusId, tenantId }, select: { id: true } })))
        return refuse(404, "NOT_FOUND", "That campus was not found.");
      const school = await tx.tenantSetting.findFirst({
        where: { tenantId, campusId: null, key },
        orderBy: { updatedAt: "desc" },
        select: { value: true },
      });
      if (input.scope === "CAMPUS" && input.enabled === true && school && parseSwitch(school.value) === false)
        return refuse(400, "VALIDATION", "A campus can only turn this off, not on: the school has it off.");
      const existing = await tx.tenantSetting.findFirst({
        where: { tenantId, campusId, key },
        orderBy: { updatedAt: "desc" },
        select: { id: true, value: true },
      });
      const before = existing ? (parseSwitch(existing.value) ?? null) : null;
      if (before === input.enabled) return { ok: true, data: false };
      if (input.enabled === null) {
        await tx.tenantSetting.deleteMany({ where: { tenantId, campusId, key } });
      } else if (existing) {
        await tx.tenantSetting.update({ where: { id: existing.id }, data: { value: input.enabled, updatedById: input.actorUserId } });
      } else {
        await tx.tenantSetting.create({ data: { tenantId, campusId, key, value: input.enabled, updatedById: input.actorUserId } });
      }
      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId: input.actorUserId,
          action: auditAction,
          targetType: "TenantSetting",
          targetId: `${key}:${campusId ?? "school"}`,
          beforeValue: before === null ? Prisma.DbNull : before,
          afterValue: input.enabled === null ? Prisma.DbNull : input.enabled,
          reason: input.reason ?? null,
        },
      });
      return { ok: true, data: true };
    });
    if (!outcome.ok) return outcome;
    return { ok: true, data: await view(tenant) };
  }

  return { stored, onFor, view, set };
}
