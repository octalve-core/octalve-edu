import type { Prisma, Role } from "@prisma/client";
import type { TenantAuthContext } from "@/lib/auth/with-auth";
import type { Tx } from "@/lib/tenant/for-tenant";
import { writeBankAudit } from "@/lib/question-bank/audit";
import {
  BANK_DEFAULTS,
  BANK_SETTING_KEYS,
  BANK_SETTING_META,
  completeBankSettings,
  effectiveBankSettings,
  isNarrowing,
  parseBankSetting,
  settingProblems,
  type BankSettingKey,
  type BankSettingMeta,
  type BankSettingValues,
} from "@/lib/question-bank/settings";

// The database side of the question bank's switches: QuestionBankSetting rows (the school's value has no campus, a campus's own has one), read through the pure resolver in
// settings.ts and changed through `changeBankSettings`, which validates, enforces "a campus may only narrow" and writes one audit row per change in the same transaction (with
// the fresh re-authentication the route verified, decision D3). The routes only decide WHO may call and verify the proof; every rule about WHAT is here.

type TenantCtx = TenantAuthContext["tenant"];
type Raw = Record<string, unknown>;

const isBankKey = (key: string): key is BankSettingKey => (BANK_SETTING_KEYS as readonly string[]).includes(key);

/// The stored raw values: the school's rows, and (when a campus is named) that campus's. A key stored twice for the school (the nullable campus column cannot stop a race in
/// the unique index only where it is null on both sides) resolves to the most recently updated.
export async function readBankRows(tx: Tx, tenantId: string, campusId: string | null): Promise<{ school: Raw; campus: Raw }> {
  const rows = await tx.questionBankSetting.findMany({
    where: { tenantId, OR: campusId ? [{ campusId: null }, { campusId }] : [{ campusId: null }] },
    orderBy: { updatedAt: "asc" },
    select: { campusId: true, key: true, value: true },
  });
  const school: Raw = Object.create(null) as Raw;
  const campus: Raw = Object.create(null) as Raw;
  for (const row of rows) (row.campusId === null ? school : campus)[row.key] = row.value;
  return { school, campus };
}

/// The settings that apply to a campus (or the school's own when `campusId` is null), read inside the caller's transaction.
export async function effectiveSettingsIn(tx: Tx, tenantId: string, campusId: string | null): Promise<BankSettingValues> {
  const { school, campus } = await readBankRows(tx, tenantId, campusId);
  return effectiveBankSettings(school, campus);
}

export type BankSettingRow = {
  key: BankSettingKey;
  label: string;
  help: string;
  kind: BankSettingMeta["kind"];
  choices: BankSettingMeta["choices"] | null;
  min: number | null;
  max: number | null;
  unit: string | null;
  stricter: string;
  /// The built-in start value.
  default: BankSettingValues[BankSettingKey];
  /// The school's value (the default when none is stored).
  school: BankSettingValues[BankSettingKey];
  /// This campus's own value, or null when it has none (or it is not valid).
  override: BankSettingValues[BankSettingKey] | null;
  /// What actually applies, after narrowing and after the numbers are made to agree.
  effective: BankSettingValues[BankSettingKey];
};

/// What the settings screen shows: for each key the default, the school's value, the campus's override and the effective value.
export async function bankSettingsView(tenant: TenantCtx, campusId: string | null): Promise<BankSettingRow[]> {
  return tenant.run((tx) => viewIn(tx, tenant.tenantId, campusId));
}

async function viewIn(tx: Tx, tenantId: string, campusId: string | null): Promise<BankSettingRow[]> {
  const { school: stored, campus } = await readBankRows(tx, tenantId, campusId);
  const school = completeBankSettings(stored);
  const effective = effectiveBankSettings(stored, campus);
  return BANK_SETTING_KEYS.map((key) => {
    const meta = BANK_SETTING_META[key];
    const mine = campusId ? parseBankSetting(key, Object.hasOwn(campus, key) ? campus[key] : undefined) : { ok: false as const };
    return {
      key,
      label: meta.label,
      help: meta.help,
      kind: meta.kind,
      choices: meta.choices ?? null,
      min: meta.min ?? null,
      max: meta.max ?? null,
      unit: meta.unit ?? null,
      stricter: meta.stricter,
      default: BANK_DEFAULTS[key],
      school: school[key],
      override: mine.ok ? (mine.value as BankSettingValues[BankSettingKey]) : null,
      effective: effective[key],
    };
  });
}

export type ChangeInput = {
  actorUserId: string;
  actorRole: Role;
  /// The campus the actor is tied to (a campus administrator's own).
  actorCampusId: string | null;
  scope: "SCHOOL" | "CAMPUS";
  campusId: string | null;
  /// key -> the new value, or null to clear (a campus's override goes away; the school's value goes back to the default).
  changes: Raw;
  reason?: string | null;
  /// When the person last proved who they are: the route verified the proof, and the audit row records it.
  stepUpVerifiedAt: Date;
};

export type Detail = { path: string; message: string };
export type ChangeResult =
  | { ok: true; changed: BankSettingKey[]; settings: BankSettingRow[] }
  | { ok: false; status: 400 | 403 | 404; code: "VALIDATION" | "FORBIDDEN" | "NOT_FOUND"; message: string; details: Detail[] };

const refuse = (status: 400 | 403 | 404, code: "VALIDATION" | "FORBIDDEN" | "NOT_FOUND", message: string, details: Detail[] = []) =>
  ({ ok: false, status, code, message, details }) satisfies ChangeResult;

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export async function changeBankSettings(tenant: TenantCtx, input: ChangeInput): Promise<ChangeResult> {
  const isAdmin = input.actorRole === "ADMIN";
  if (input.scope === "SCHOOL" && !isAdmin) return refuse(403, "FORBIDDEN", "Only a school administrator can change the school's own settings.");
  if (input.scope === "SCHOOL" && input.campusId) return refuse(400, "VALIDATION", "A school-wide change does not name a campus.");
  if (input.scope === "CAMPUS" && !input.campusId) return refuse(400, "VALIDATION", "A campus change needs the campus.");
  if (input.scope === "CAMPUS" && !isAdmin) {
    // a campus administrator changes their own campus only; any other campus is a campus that does not exist, to them
    if (input.actorRole !== "CAMPUS_ADMIN" || input.actorCampusId === null) return refuse(403, "FORBIDDEN", "Only an administrator can change these settings.");
    if (input.campusId !== input.actorCampusId) return refuse(404, "NOT_FOUND", "Not found");
  }

  const keys = Object.keys(input.changes);
  if (keys.length === 0) return refuse(400, "VALIDATION", "Nothing to change.");
  const unknown = keys.filter((key) => !isBankKey(key));
  if (unknown.length > 0)
    return refuse(
      400,
      "VALIDATION",
      "Some of those are not question bank settings.",
      unknown.slice(0, 20).map((key) => ({ path: `changes.${key.slice(0, 80)}`, message: "Unknown question bank setting." })),
    );

  // Each new value on its own: right type, within bounds. null means "clear".
  const parsed: Partial<Record<BankSettingKey, unknown>> = {};
  const invalid: Detail[] = [];
  for (const key of keys as BankSettingKey[]) {
    const value = input.changes[key];
    if (value === null) {
      parsed[key] = null;
      continue;
    }
    const result = parseBankSetting(key, value);
    if (result.ok) parsed[key] = result.value;
    else invalid.push({ path: `changes.${key}`, message: result.message });
  }
  if (invalid.length > 0) return refuse(400, "VALIDATION", "Some of the values are not valid.", invalid);

  const { tenantId } = tenant;
  return tenant.run(async (tx): Promise<ChangeResult> => {
    // One change at a time per school: the stored values this validates against (and the old values the audit records) cannot move underneath it.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`question-bank:settings:${tenantId}`}))`;

    if (input.scope === "CAMPUS") {
      const campus = await tx.campus.findFirst({ where: { id: input.campusId!, tenantId }, select: { id: true } });
      if (!campus) return refuse(404, "NOT_FOUND", "Not found");
    }

    const { school: stored, campus } = await readBankRows(tx, tenantId, input.campusId);
    const school = completeBankSettings(stored);
    const target: Raw = input.scope === "SCHOOL" ? stored : campus;

    // A campus may only make a value stricter than the school's. Clearing an override is always allowed.
    if (input.scope === "CAMPUS") {
      const widening: Detail[] = [];
      for (const key of keys as BankSettingKey[]) {
        const value = parsed[key];
        if (value === null) continue;
        if (!isNarrowing(key, school[key] as never, value as never))
          widening.push({ path: `changes.${key}`, message: `A campus can only make this stricter than the school's setting. ${BANK_SETTING_META[key].stricter}` });
      }
      if (widening.length > 0) return refuse(400, "VALIDATION", "A campus can only narrow a setting, not widen it.", widening);
    }

    // The school's numbers must agree with each other once the change is applied (default set size within the maximum, and so on), so the administrator fixes them together.
    // A campus is not asked to: it may narrow one number alone, and the resolver then makes the dependent ones fit (a set can never exceed the maximum).
    if (input.scope === "SCHOOL") {
      const after: Raw = Object.assign(Object.create(null) as Raw, target);
      for (const key of keys as BankSettingKey[]) {
        if (parsed[key] === null) delete after[key];
        else after[key] = parsed[key];
      }
      const problems = settingProblems(completeBankSettings(after));
      if (problems.length > 0)
        return refuse(400, "VALIDATION", problems[0], problems.map((message) => ({ path: "changes", message })));
    }

    const campusId = input.scope === "SCHOOL" ? null : input.campusId;
    const changed: BankSettingKey[] = [];
    for (const key of keys as BankSettingKey[]) {
      const before = Object.hasOwn(target, key) ? target[key] : undefined;
      const next = parsed[key];
      if (next === null ? before === undefined : same(before, next)) continue; // nothing actually changes
      const existing = await tx.questionBankSetting.findFirst({ where: { tenantId, campusId, key }, select: { id: true } });
      if (next === null) {
        await tx.questionBankSetting.deleteMany({ where: { tenantId, campusId, key } });
      } else if (existing) {
        await tx.questionBankSetting.update({ where: { id: existing.id }, data: { value: next as Prisma.InputJsonValue, updatedById: input.actorUserId } });
      } else {
        await tx.questionBankSetting.create({ data: { tenantId, campusId, key, value: next as Prisma.InputJsonValue, updatedById: input.actorUserId } });
      }
      await writeBankAudit(tx, {
        tenantId,
        campusId,
        actorUserId: input.actorUserId,
        entity: "SETTING",
        action: next === null ? "CLEARED" : before === undefined ? "SET" : "CHANGED",
        ref: key,
        oldValue: before === undefined ? null : (before as Prisma.InputJsonValue),
        newValue: next === null ? null : (next as Prisma.InputJsonValue),
        reason: input.reason ?? null,
        stepUpVerifiedAt: input.stepUpVerifiedAt,
      });
      changed.push(key);
    }
    return { ok: true, changed, settings: await viewIn(tx, tenantId, input.campusId) };
  });
}
