import {
  Prisma,
  ProgramPlaceStatus,
  type InvoiceStatus,
  type ParticipantKind,
  type ProgramFeeBilledTo,
  type ProgramFeeFrequency,
  type ProgramFeeStatus,
} from "@prisma/client";
import type { TenantAuthContext } from "@/lib/auth/with-auth";
import type { Tx } from "@/lib/tenant/for-tenant";
import { describePolicy } from "@/lib/finance/part-payment";
import { loadEffectivePolicy } from "@/lib/finance/part-payment-service";
import { asDate, namesOf, today } from "@/lib/standing/common";
import { canManage, viewerOf, type ProgramViewer } from "./access";
import { change, done, reading, refuse, writeAudit, type Result } from "./common";
import { featureStateOf, type FeatureState, type FeatureView } from "./feature-switch";
import {
  MAX_FEE_ITEMS,
  collectionRate,
  dueDateFor,
  feeApplies,
  frequencyOfKey,
  fromCents,
  lineOf,
  linesTotal,
  parseAudience,
  programInvoiceNo,
  statusOf,
  toCents,
  totalAfterDiscounts,
  billingContact,
  type Audience,
  type FeeLine,
} from "./fees-rules";
import { groupAndInner } from "./people-rules";
import { billingPeople, type BillingPerson } from "./people-service";
import { groupPath, toIsoDate } from "./rules";
import { feesSwitch } from "./settings-service";

// Programs, slice P4: the fees of a program (task 0027, section 11). Fee items, the invoices made from them, discounts and reports live in tables of their own; the school's Invoice and
// Payment tables are untouched. Payments (recording, the gateway and its webhook) are in fees-payments.ts and go through the same part-payment rule as the school's money.

const ITEM_NOT_FOUND = "That fee was not found.";
const INVOICE_NOT_FOUND = "That invoice was not found.";
export const MAX_INVOICES_PER_RUN = 2000;
const PAGE = 50;

export const feesStateOf = (tx: Tx, tenantId: string, programId: string, programFlag: boolean): Promise<FeatureState> =>
  featureStateOf(tx, tenantId, feesSwitch.stored, programId, programFlag);
export const FEES_OFF = () => refuse(409, "FEES_OFF", "Fees are switched off for this program.");

type GroupNode = { id: string; parentId: string | null; name: string; archivedAt: Date | null };
type ItemRow = Prisma.ProgramFeeItemGetPayload<{ include: { exemptions: { select: { participantId: true } } } }>;

const groupsOf = (client: Pick<Tx, "programGroup">, tenantId: string, programId: string): Promise<GroupNode[]> =>
  client.programGroup.findMany({ where: { tenantId, programId }, select: { id: true, parentId: true, name: true, archivedAt: true } });

/// Who may read the fees of a program, and through which campuses: a school administrator and a program admin all of them; a campus administrator the invoices through their own campuses;
/// a supervisor, a teacher and a recorder none (403: they have a place in the program, just none in its money).
export type Reach = { all: true } | { all: false; campusIds: string[] };
export const reachOf = (viewer: ProgramViewer): Reach | null =>
  viewer.level === "SUPER" || viewer.level === "ADMIN"
    ? { all: true }
    : viewer.level === "CAMPUS"
      ? { all: false, campusIds: [viewer.campusId] }
      : null;
const invoiceReach = (reach: Reach): Prisma.ProgramInvoiceWhereInput => (reach.all ? {} : { campusId: { in: reach.campusIds } });
const NO_FEES_FOR_YOU = () => refuse(403, "FORBIDDEN", "You don't have permission to see the fees.");

/// A read of the fees of one program: inside the tenant transaction, with the viewer and what they reach (403 for a place in the program that has none in its money).
function readingFees<T>(
  auth: TenantAuthContext,
  programId: string,
  work: (context: { tx: Tx; viewer: ProgramViewer; reach: Reach }) => Promise<Result<T>>,
): Promise<Result<T>> {
  return reading(auth, programId, async ({ tx, viewer }) => {
    const reach = reachOf(viewer);
    return reach ? work({ tx, viewer, reach }) : NO_FEES_FOR_YOU();
  });
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Fee items

export type FeeItem = {
  id: string;
  name: string;
  amount: number;
  frequency: ProgramFeeFrequency;
  dueDay: number | null;
  audience: Audience;
  discountPercent: number | null;
  billedTo: ProgramFeeBilledTo;
  status: ProgramFeeStatus;
  exemptIds: string[];
};
const itemOf = (row: ItemRow): FeeItem => ({
  id: row.id,
  name: row.name,
  amount: Number(row.amount),
  frequency: row.frequency,
  dueDay: row.dueDay,
  audience: parseAudience(row.audience),
  discountPercent: row.discountPercent === null ? null : Number(row.discountPercent),
  billedTo: row.billedTo,
  status: row.status,
  exemptIds: row.exemptions.map((e) => e.participantId),
});

export async function listFeeItems(
  auth: TenantAuthContext,
  programId: string,
): Promise<Result<{ items: FeeItem[]; state: FeatureView; canManage: boolean }>> {
  const { tenantId } = auth.tenant;
  const actorUserId = auth.userId;
  return readingFees(auth, programId, async ({ tx, viewer, reach }) => {
    const [program, rows] = await Promise.all([
      tx.program.findUniqueOrThrow({ where: { tenantId, id: programId }, select: { feesEnabled: true, status: true } }),
      tx.programFeeItem.findMany({
        where: { tenantId, programId },
        include: { exemptions: { select: { participantId: true } } },
        orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      }),
    ]);
    const state = await feesStateOf(tx, tenantId, programId, program.feesEnabled);
    return done({
      items: rows.map(itemOf),
      state: { on: state.on, offBy: state.offBy, campusesOff: state.campusesOff },
      canManage: canManage(viewer) && (program.status === "DRAFT" || program.status === "ACTIVE") && state.on,
    });
  });
}

export type FeeItemInput = {
  name: string;
  amount: number;
  frequency: ProgramFeeFrequency;
  dueDay?: number | null;
  audience: Audience;
  discountPercent?: number | null;
  billedTo: ProgramFeeBilledTo;
  exemptIds: string[];
};

/// The audience and the exemptions must name things of THIS program: groups that are live, campuses it runs in, people who are in it.
async function audienceProblem(
  tx: Tx,
  tenantId: string,
  programId: string,
  audience: Audience,
  exemptIds: string[],
): Promise<Result<never> | null> {
  const groupIds = [...new Set(audience.groupIds ?? [])];
  if (
    groupIds.length > 0 &&
    (await tx.programGroup.count({ where: { tenantId, programId, id: { in: groupIds }, archivedAt: null } })) !== groupIds.length
  )
    return refuse(404, "NOT_FOUND", "That group was not found.");
  const campusIds = [...new Set(audience.campusIds ?? [])];
  if (
    campusIds.length > 0 &&
    (await tx.programCampus.count({ where: { tenantId, programId, campusId: { in: campusIds } } })) !== campusIds.length
  )
    return refuse(400, "VALIDATION", "The program does not run in that campus.", [
      { path: "body.audience.campusIds", message: "The program does not run in that campus." },
    ]);
  const people = [...new Set(exemptIds)];
  if (people.length > 0 && (await tx.programParticipant.count({ where: { tenantId, programId, id: { in: people } } })) !== people.length)
    return refuse(404, "NOT_FOUND", "That person was not found.");
  return null;
}

const cleanAudience = (a: Audience): Audience => ({
  ...(a.kinds && a.kinds.length > 0 ? { kinds: [...new Set(a.kinds)] } : {}),
  ...(a.campusIds && a.campusIds.length > 0 ? { campusIds: [...new Set(a.campusIds)] } : {}),
  ...(a.groupIds && a.groupIds.length > 0 ? { groupIds: [...new Set(a.groupIds)] } : {}),
});

export async function createFeeItem(auth: TenantAuthContext, programId: string, input: FeeItemInput): Promise<Result<{ id: string }>> {
  const { tenantId } = auth.tenant;
  const actorUserId = auth.userId;
  return change(auth, programId, "manage", async ({ tx, program }) => {
    const state = await feesStateOf(tx, tenantId, program.id, program.feesEnabled);
    if (!state.on) return FEES_OFF();
    if ((await tx.programFeeItem.count({ where: { tenantId, programId } })) >= MAX_FEE_ITEMS)
      return refuse(409, "TOO_MANY", `A program can have at most ${MAX_FEE_ITEMS} fees.`);
    const audience = cleanAudience(input.audience);
    const bad = await audienceProblem(tx, tenantId, programId, audience, input.exemptIds);
    if (bad) return bad;
    const created = await tx.programFeeItem.create({
      data: {
        tenantId,
        programId,
        name: input.name,
        amount: input.amount,
        frequency: input.frequency,
        dueDay: input.dueDay ?? null,
        audience: audience as Prisma.InputJsonValue,
        discountPercent: input.discountPercent ?? null,
        billedTo: input.billedTo,
        createdByUserId: actorUserId,
      },
    });
    // The exemptions are written on their own: a nested create cannot fill the composite key (program, fee) that two relations share.
    if (input.exemptIds.length > 0)
      await tx.programFeeExemption.createMany({
        data: [...new Set(input.exemptIds)].map((participantId) => ({
          tenantId,
          feeItemId: created.id,
          participantId,
          programId,
          createdByUserId: actorUserId,
        })),
      });
    await writeAudit(tx, tenantId, {
      programId,
      actorUserId,
      action: "FEE_ITEM_CREATED",
      targetType: "FeeItem",
      targetId: created.id,
      after: { name: input.name, amount: input.amount, frequency: input.frequency },
    });
    return done({ id: created.id });
  });
}

export type FeeItemChange = Partial<FeeItemInput> & { status?: ProgramFeeStatus };

/// Changing a fee changes only invoices made from now on (an invoice keeps the lines it was made with); archiving stops it being billed.
export async function updateFeeItem(
  auth: TenantAuthContext,
  programId: string,
  itemId: string,
  input: FeeItemChange,
): Promise<Result<{ id: string }>> {
  const { tenantId } = auth.tenant;
  const actorUserId = auth.userId;
  return change(auth, programId, "manage", async ({ tx, program }) => {
    const state = await feesStateOf(tx, tenantId, program.id, program.feesEnabled);
    if (!state.on) return FEES_OFF();
    const current = await tx.programFeeItem.findFirst({ where: { tenantId, id: itemId, programId } });
    if (!current) return refuse(404, "NOT_FOUND", ITEM_NOT_FOUND);
    const audience = input.audience ? cleanAudience(input.audience) : undefined;
    const bad = await audienceProblem(tx, tenantId, programId, audience ?? {}, input.exemptIds ?? []);
    if (bad) return bad;
    await tx.programFeeItem.update({
      where: { tenantId, id: itemId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.amount !== undefined ? { amount: input.amount } : {}),
        ...(input.frequency !== undefined ? { frequency: input.frequency } : {}),
        ...(input.dueDay !== undefined ? { dueDay: input.dueDay } : {}),
        ...(audience ? { audience: audience as Prisma.InputJsonValue } : {}),
        ...(input.discountPercent !== undefined ? { discountPercent: input.discountPercent } : {}),
        ...(input.billedTo !== undefined ? { billedTo: input.billedTo } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
    });
    if (input.exemptIds) {
      await tx.programFeeExemption.deleteMany({ where: { tenantId, feeItemId: itemId } });
      if (input.exemptIds.length > 0)
        await tx.programFeeExemption.createMany({
          data: [...new Set(input.exemptIds)].map((participantId) => ({
            tenantId,
            feeItemId: itemId,
            participantId,
            programId,
            createdByUserId: actorUserId,
          })),
        });
    }
    await writeAudit(tx, tenantId, {
      programId,
      actorUserId,
      action: input.status === "ARCHIVED" ? "FEE_ITEM_ARCHIVED" : "FEE_ITEM_CHANGED",
      targetType: "FeeItem",
      targetId: itemId,
      after: JSON.parse(JSON.stringify(input)),
    });
    return done({ id: itemId });
  });
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Making the invoices of a period

export type PlanRow = {
  participantId: string;
  name: string;
  groupPath: string;
  campusId: string | null;
  totalCents: number;
  lines: FeeLine[];
  billingName: string | null;
  billingPhone: string | null;
  dueDate: string | null;
  billedTo: ProgramFeeBilledTo;
};
export type Plan = {
  periodKey: string;
  willGet: PlanRow[];
  skipped: { participantId: string; name: string; reason: string }[];
  noFee: number;
  items: number;
};

/// Who would get an invoice for a period, and who is skipped and why. Pure of side effects: the preview and the real step compute it the same way.
async function planFor(client: Tx, tenantId: string, programId: string, periodKey: string, state: FeatureState): Promise<Plan> {
  const frequency = frequencyOfKey(periodKey);
  const [items, groups, existing] = await Promise.all([
    client.programFeeItem.findMany({
      where: { tenantId, programId, status: "ACTIVE", frequency },
      include: { exemptions: { select: { participantId: true } } },
    }),
    groupsOf(client, tenantId, programId),
    client.programInvoice.findMany({ where: { tenantId, programId, periodKey }, select: { participantId: true } }),
  ]);
  const have = new Set(existing.map((e) => e.participantId));
  const people: BillingPerson[] = await billingPeople(client, { tenantId, programId, status: ProgramPlaceStatus.ACTIVE }, today());
  const rules = items.map((row) => {
    const item = itemOf(row);
    const groupSet =
      item.audience.groupIds && item.audience.groupIds.length > 0
        ? new Set(item.audience.groupIds.flatMap((g) => groupAndInner(groups, g)))
        : null;
    return { item, context: { exempt: new Set(item.exemptIds), groupSet } };
  });
  const willGet: PlanRow[] = [];
  const skipped: Plan["skipped"] = [];
  let noFee = 0;
  for (const person of people) {
    const applicable = rules.filter(
      (r) =>
        feeApplies(
          r.item,
          { id: person.id, kind: person.kind, campusId: person.campusId, groupId: person.groupId, state: person.state },
          r.context,
        ).applies,
    );
    if (applicable.length === 0) {
      noFee += 1;
      continue;
    }
    if (have.has(person.id)) {
      skipped.push({ participantId: person.id, name: person.name, reason: "Already has an invoice for this period." });
      continue;
    }
    if (!state.isOn(person.campusId)) {
      skipped.push({ participantId: person.id, name: person.name, reason: "Fees are switched off for this campus." });
      continue;
    }
    const billedTo: ProgramFeeBilledTo = applicable.some((r) => r.item.billedTo === "GUARDIAN") ? "GUARDIAN" : "PARTICIPANT";
    const contact = billingContact(billedTo, person);
    if (!contact) {
      skipped.push({ participantId: person.id, name: person.name, reason: "No contact on record to bill." });
      continue;
    }
    const lines = applicable.map((r) =>
      lineOf({ id: r.item.id, name: r.item.name, amountCents: toCents(r.item.amount), discountPercent: r.item.discountPercent }),
    );
    const totalCents = linesTotal(lines);
    if (totalCents <= 0) {
      skipped.push({ participantId: person.id, name: person.name, reason: "Fully discounted: nothing to pay." });
      continue;
    }
    const dueDays = applicable.map((r) => r.item.dueDay).filter((d): d is number => d !== null);
    willGet.push({
      participantId: person.id,
      name: person.name,
      groupPath: groupPath(groups, person.groupId),
      campusId: person.campusId,
      totalCents,
      lines,
      billingName: contact.name,
      billingPhone: contact.phone,
      dueDate: dueDays.length > 0 ? dueDateFor(Math.min(...dueDays), periodKey) : null,
      billedTo,
    });
  }
  return { periodKey, willGet, skipped, noFee, items: items.length };
}

const SHOWN = 500;
export type PlanView = {
  periodKey: string;
  items: number;
  count: number;
  totalAmount: number;
  willGet: { participantId: string; name: string; groupPath: string; amount: number }[];
  skipped: { participantId: string; name: string; reason: string }[];
  noFee: number;
  truncated: boolean;
  limit: number;
};
const viewOf = (plan: Plan): PlanView => ({
  periodKey: plan.periodKey,
  items: plan.items,
  count: plan.willGet.length,
  totalAmount: fromCents(plan.willGet.reduce((sum, r) => sum + r.totalCents, 0)),
  willGet: plan.willGet
    .slice(0, SHOWN)
    .map((r) => ({ participantId: r.participantId, name: r.name, groupPath: r.groupPath, amount: fromCents(r.totalCents) })),
  skipped: plan.skipped.slice(0, SHOWN),
  noFee: plan.noFee,
  truncated: plan.willGet.length > SHOWN || plan.skipped.length > SHOWN,
  limit: MAX_INVOICES_PER_RUN,
});

/// What generating a period would do, before anything happens. A school administrator or a program admin.
export async function previewInvoices(auth: TenantAuthContext, programId: string, periodKey: string): Promise<Result<PlanView>> {
  const { tenantId } = auth.tenant;
  return reading(auth, programId, async ({ tx, viewer }) => {
    if (!canManage(viewer)) return refuse(403, "FORBIDDEN", "You don't have permission to do that.");
    const program = await tx.program.findUniqueOrThrow({ where: { tenantId, id: programId }, select: { feesEnabled: true } });
    const state = await feesStateOf(tx, tenantId, programId, program.feesEnabled);
    return done(viewOf(await planFor(tx, tenantId, programId, periodKey, state)));
  });
}

/// The next number of a kind ("invoice", "receipt") for the school and year: `UPDATE ... RETURNING` on the school's counter, in the caller's transaction (the row lock serialises concurrent
/// allocations; a rollback gives the number back).
export async function nextNumber(tx: Tx, tenantId: string, kind: "invoice" | "receipt" | "certificate", year: number): Promise<number> {
  const rows = await tx.$queryRaw<{ seq: number }[]>`
    INSERT INTO "ProgramCounter" ("tenantId", "kind", "year", "next") VALUES (${tenantId}, ${kind}, ${year}::int, 2)
    ON CONFLICT ("tenantId", "kind", "year") DO UPDATE SET "next" = "ProgramCounter"."next" + 1
    RETURNING ("next" - 1)::int AS seq`;
  return rows[0]!.seq;
}

async function nextInvoiceNo(tx: Tx, tenantId: string, year: number): Promise<string> {
  return programInvoiceNo(year, await nextNumber(tx, tenantId, "invoice", year));
}

const lineJson = (line: FeeLine) => ({
  itemId: line.itemId,
  name: line.name,
  amount: fromCents(line.amountCents),
  discountPercent: line.discountPercent,
  net: fromCents(line.netCents),
});
const linesOf = (json: Prisma.JsonValue): FeeLine[] =>
  (Array.isArray(json) ? json : []).flatMap((l) => {
    const line = l as { itemId?: string; name?: string; amount?: number; discountPercent?: number | null; net?: number };
    return typeof line?.itemId === "string" && typeof line.amount === "number" && typeof line.net === "number"
      ? [
          {
            itemId: line.itemId,
            name: String(line.name ?? ""),
            amountCents: toCents(line.amount),
            discountPercent: line.discountPercent ?? null,
            netCents: toCents(line.net),
          },
        ]
      : [];
  });

/// Makes the invoices of a period in one step under the program's lock, for the people the preview lists. Never changes an invoice that exists, so running it again makes nothing new.
export async function generateInvoices(
  auth: TenantAuthContext,
  programId: string,
  periodKey: string,
): Promise<Result<{ created: number; skipped: number; totalAmount: number; more: boolean }>> {
  const { tenantId } = auth.tenant;
  const actorUserId = auth.userId;
  return change(auth, programId, "manage", async ({ tx, program }) => {
    const state = await feesStateOf(tx, tenantId, program.id, program.feesEnabled);
    if (!state.on) return FEES_OFF();
    const plan = await planFor(tx, tenantId, programId, periodKey, state);
    const batch = plan.willGet.slice(0, MAX_INVOICES_PER_RUN);
    const year = new Date().getUTCFullYear();
    let total = 0;
    for (const row of batch) {
      await tx.programInvoice.create({
        data: {
          tenantId,
          programId,
          campusId: row.campusId,
          participantId: row.participantId,
          periodKey,
          invoiceNo: await nextInvoiceNo(tx, tenantId, year),
          totalAmount: fromCents(row.totalCents),
          dueDate: row.dueDate ? asDate(row.dueDate) : null,
          lineItems: row.lines.map(lineJson),
          billingName: row.billingName,
          billingPhone: row.billingPhone,
          createdByUserId: actorUserId,
        },
      });
      total += row.totalCents;
    }
    if (batch.length > 0)
      await writeAudit(tx, tenantId, {
        programId,
        actorUserId,
        action: "INVOICES_GENERATED",
        targetType: "Invoices",
        targetId: periodKey,
        after: { periodKey, created: batch.length, skipped: plan.skipped.length, totalAmount: fromCents(total) },
      });
    return done({
      created: batch.length,
      skipped: plan.skipped.length,
      totalAmount: fromCents(total),
      more: plan.willGet.length > batch.length,
    });
  });
}

/// A fee added later goes onto the invoices of a period that nobody has paid anything on (and that have no discount): never onto a paid or part-paid one. Explicit and audited.
export async function addFeeToOpenInvoices(
  auth: TenantAuthContext,
  programId: string,
  itemId: string,
  periodKey: string,
): Promise<Result<{ updated: number; skipped: number }>> {
  const { tenantId } = auth.tenant;
  const actorUserId = auth.userId;
  return change(auth, programId, "manage", async ({ tx, program }) => {
    const state = await feesStateOf(tx, tenantId, program.id, program.feesEnabled);
    if (!state.on) return FEES_OFF();
    const itemRow = await tx.programFeeItem.findFirst({
      where: { tenantId, id: itemId, programId },
      include: { exemptions: { select: { participantId: true } } },
    });
    if (!itemRow) return refuse(404, "NOT_FOUND", ITEM_NOT_FOUND);
    if (itemRow.status !== "ACTIVE") return refuse(409, "NOT_ACTIVE", "That fee is archived.");
    if (itemRow.frequency !== frequencyOfKey(periodKey))
      return refuse(409, "WRONG_PERIOD", "That period does not match how often the fee is charged.");
    const item = itemOf(itemRow);
    const groups = await groupsOf(tx, tenantId, programId);
    const groupSet =
      item.audience.groupIds && item.audience.groupIds.length > 0
        ? new Set(item.audience.groupIds.flatMap((g) => groupAndInner(groups, g)))
        : null;
    const invoices = await tx.programInvoice.findMany({
      where: { tenantId, programId, periodKey },
      include: { participant: { select: { id: true, kind: true, campusId: true, groupId: true } }, discounts: { select: { id: true } } },
    });
    const people = new Map(
      (await billingPeople(tx, { tenantId, programId, id: { in: invoices.map((i) => i.participantId) } }, today())).map((p) => [p.id, p]),
    );
    let updated = 0;
    let skipped = 0;
    for (const invoice of invoices) {
      const person = people.get(invoice.participantId);
      const lines = linesOf(invoice.lineItems);
      const open = invoice.status === "UNPAID" && Number(invoice.amountPaid) === 0 && invoice.discounts.length === 0;
      const applies =
        person &&
        feeApplies(
          item,
          { id: person.id, kind: person.kind, campusId: person.campusId, groupId: person.groupId, state: person.state },
          { exempt: new Set(item.exemptIds), groupSet },
        ).applies;
      if (!open || !applies || lines.some((l) => l.itemId === itemId)) {
        skipped += 1;
        continue;
      }
      const added = lineOf({ id: item.id, name: item.name, amountCents: toCents(item.amount), discountPercent: item.discountPercent });
      const all = [...lines, added];
      await tx.programInvoice.update({
        where: { tenantId, id: invoice.id },
        data: { lineItems: all.map(lineJson), totalAmount: fromCents(linesTotal(all)) },
      });
      updated += 1;
    }
    await writeAudit(tx, tenantId, {
      programId,
      actorUserId,
      action: "FEE_ADDED_TO_OPEN_INVOICES",
      targetType: "FeeItem",
      targetId: itemId,
      after: { periodKey, updated, skipped },
    });
    return done({ updated, skipped });
  });
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Invoices

export type InvoiceRow = {
  id: string;
  invoiceNo: string;
  periodKey: string;
  participantId: string;
  name: string;
  kind: ParticipantKind;
  groupPath: string;
  campusId: string | null;
  campusName: string;
  total: number;
  paid: number;
  balance: number;
  status: InvoiceStatus;
  dueDate: string | null;
  payInFull: boolean;
};

const personInclude = {
  participant: {
    select: {
      kind: true,
      groupId: true,
      firstName: true,
      lastName: true,
      student: { select: { firstName: true, lastName: true } },
      staffRecord: { select: { firstName: true, lastName: true } },
    },
  },
} satisfies Prisma.ProgramInvoiceInclude;
type InvoiceWithPerson = Prisma.ProgramInvoiceGetPayload<{ include: typeof personInclude }>;
const personName = (row: InvoiceWithPerson["participant"]): string =>
  row.student
    ? `${row.student.firstName} ${row.student.lastName}`
    : row.staffRecord
      ? `${row.staffRecord.firstName} ${row.staffRecord.lastName}`
      : `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim();

const escapeLike = (value: string) => value.replace(/[\\%_]/g, "\\$&");

function toRow(row: InvoiceWithPerson, groups: GroupNode[], campuses: Map<string, string>): InvoiceRow {
  const total = Number(row.totalAmount);
  const paid = Number(row.amountPaid);
  return {
    id: row.id,
    invoiceNo: row.invoiceNo,
    periodKey: row.periodKey,
    participantId: row.participantId,
    name: personName(row.participant),
    kind: row.participant.kind,
    groupPath: groupPath(groups, row.participant.groupId),
    campusId: row.campusId,
    campusName: row.campusId ? (campuses.get(row.campusId) ?? "") : "",
    total,
    paid,
    balance: fromCents(toCents(total) - toCents(paid)),
    status: row.status,
    dueDate: row.dueDate ? toIsoDate(row.dueDate) : null,
    payInFull: row.payInFull,
  };
}

export type InvoiceQuery = { status?: InvoiceStatus; groupId?: string; campusId?: string; periodKey?: string; q?: string; page: number };

export async function listInvoices(
  auth: TenantAuthContext,
  programId: string,
  query: InvoiceQuery,
): Promise<Result<{ invoices: InvoiceRow[]; total: number; page: number; pageSize: number; hasNext: boolean }>> {
  const { tenantId } = auth.tenant;
  const actorUserId = auth.userId;
  return readingFees(auth, programId, async ({ tx, viewer, reach }) => {
    const groups = await groupsOf(tx, tenantId, programId);
    const links = await tx.programCampus.findMany({
      where: { tenantId, programId },
      select: { campus: { select: { id: true, name: true } } },
    });
    const campuses = new Map(links.map((l) => [l.campus.id, l.campus.name]));
    const q = query.q?.trim();
    const like = q ? { contains: escapeLike(q), mode: "insensitive" as const } : null;
    const where: Prisma.ProgramInvoiceWhereInput = {
      programId,
      AND: [
        invoiceReach(reach),
        ...(query.status ? [{ status: query.status }] : []),
        ...(query.campusId ? [{ campusId: query.campusId }] : []),
        ...(query.periodKey ? [{ periodKey: query.periodKey }] : []),
        ...(query.groupId ? [{ participant: { groupId: { in: groupAndInner(groups, query.groupId) } } }] : []),
        ...(like
          ? [
              {
                OR: [
                  { invoiceNo: like },
                  {
                    participant: {
                      OR: [
                        { firstName: like },
                        { lastName: like },
                        { student: { OR: [{ firstName: like }, { lastName: like }, { admissionNo: like }] } },
                        { staffRecord: { OR: [{ firstName: like }, { lastName: like }] } },
                      ],
                    },
                  },
                ],
              },
            ]
          : []),
      ],
    };
    const skip = (query.page - 1) * PAGE;
    const [rows, total] = await Promise.all([
      tx.programInvoice.findMany({ where, include: personInclude, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip, take: PAGE }),
      tx.programInvoice.count({ where }),
    ]);
    return done({
      invoices: rows.map((r) => toRow(r, groups, campuses)),
      total,
      page: query.page,
      pageSize: PAGE,
      hasNext: skip + PAGE < total,
    });
  });
}

export type InvoiceDetail = InvoiceRow & {
  lines: { itemId: string; name: string; amount: number; discountPercent: number | null; net: number }[];
  billingName: string | null;
  billingPhone: string | null;
  payments: {
    id: string;
    amount: number;
    source: string;
    channel: string | null;
    status: string;
    receiptNo: string | null;
    paidAt: string | null;
    reference: string;
    recordedBy: string | null;
  }[];
  discounts: { id: string; amount: number; reason: string; by: string; at: string }[];
  /// The part-payment rule that applies, in words (the school's money, one rule), and whether the person looking can record a payment.
  rule: string;
  can: { pay: boolean; discount: boolean; payInFull: boolean };
  programStatus: string;
};

export async function getInvoice(auth: TenantAuthContext, programId: string, invoiceId: string): Promise<Result<InvoiceDetail>> {
  const { tenantId } = auth.tenant;
  const actorUserId = auth.userId;
  return readingFees(auth, programId, async ({ tx, viewer, reach }) => {
    const row = await tx.programInvoice.findFirst({
      where: { tenantId, id: invoiceId, programId, AND: [invoiceReach(reach)] },
      include: { ...personInclude, payments: { orderBy: { createdAt: "asc" } }, discounts: { orderBy: { createdAt: "asc" } } },
    });
    if (!row) return refuse(404, "NOT_FOUND", INVOICE_NOT_FOUND);
    const [groups, links, policy, program] = await Promise.all([
      groupsOf(tx, tenantId, programId),
      tx.programCampus.findMany({ where: { tenantId, programId }, select: { campus: { select: { id: true, name: true } } } }),
      loadEffectivePolicy(tx, tenantId, row.campusId),
      tx.program.findUniqueOrThrow({ where: { tenantId, id: programId }, select: { status: true } }),
    ]);
    const names = await namesOf(tx, tenantId, [
      ...new Set([
        ...row.discounts.map((d) => d.appliedByUserId),
        ...row.payments.flatMap((p) => (p.recordedByUserId ? [p.recordedByUserId] : [])),
      ]),
    ]);
    const base = toRow(row, groups, new Map(links.map((l) => [l.campus.id, l.campus.name])));
    const open = row.status === "UNPAID" || row.status === "PARTIALLY_PAID";
    return done({
      ...base,
      lines: linesOf(row.lineItems).map((l) => ({
        itemId: l.itemId,
        name: l.name,
        amount: fromCents(l.amountCents),
        discountPercent: l.discountPercent,
        net: fromCents(l.netCents),
      })),
      billingName: row.billingName,
      billingPhone: row.billingPhone,
      payments: row.payments.map((p) => ({
        id: p.id,
        amount: Number(p.amount),
        source: p.source,
        channel: p.channel,
        status: p.status,
        receiptNo: p.receiptNo,
        paidAt: p.paidAt?.toISOString() ?? null,
        reference: p.providerRef,
        recordedBy: p.recordedByUserId ? (names.get(p.recordedByUserId) ?? "A person who has left") : null,
      })),
      discounts: row.discounts.map((d) => ({
        id: d.id,
        amount: Number(d.amount),
        reason: d.reason,
        by: names.get(d.appliedByUserId) ?? "A person who has left",
        at: d.createdAt.toISOString(),
      })),
      rule: describePolicy(policy, row.totalAmount, row.payInFull),
      can: { pay: open, discount: open, payInFull: open },
      programStatus: program.status,
    });
  });
}

/// A campus administrator reaches only the invoices through their own campuses: any other invoice is the same 404 as one that does not exist.
export const mayTouchInvoice = (viewer: ProgramViewer, campusId: string | null): boolean =>
  canManage(viewer) || (viewer.level === "CAMPUS" && campusId !== null && viewer.campusId === campusId);

/// "Pay in full only" on one invoice (task 0046): a school administrator, a program admin, or the administrator of the invoice's campus.
export async function setProgramPayInFull(
  auth: TenantAuthContext,
  programId: string,
  invoiceId: string,
  value: boolean,
): Promise<Result<{ payInFull: boolean }>> {
  const { tenantId } = auth.tenant;
  const actorUserId = auth.userId;
  return change(
    auth,
    programId,
    "people",
    async ({ tx, viewer }) => {
      await tx.$queryRaw`SELECT "id" FROM "ProgramInvoice" WHERE "tenantId" = ${tenantId} AND "id" = ${invoiceId} AND "programId" = ${programId} FOR UPDATE`;
      const invoice = await tx.programInvoice.findFirst({ where: { tenantId, id: invoiceId, programId } });
      if (!invoice || !mayTouchInvoice(viewer, invoice.campusId)) return refuse(404, "NOT_FOUND", INVOICE_NOT_FOUND);
      if (invoice.status !== "UNPAID" && invoice.status !== "PARTIALLY_PAID") return refuse(409, "NOT_OPEN", "That invoice is not open.");
      if (invoice.payInFull === value) return done({ payInFull: value });
      await tx.programInvoice.update({ where: { tenantId, id: invoiceId }, data: { payInFull: value } });
      await writeAudit(tx, tenantId, {
        programId,
        actorUserId,
        action: "PAY_IN_FULL_CHANGED",
        targetType: "Invoice",
        targetId: invoiceId,
        after: { payInFull: value },
      });
      return done({ payInFull: value });
    },
    { allowArchived: true },
  );
}

/// A discount on one invoice: a school administrator, a program admin, or the administrator of the invoice's campus. It cannot take the total below what has been paid. Kept with who and why.
export async function applyProgramDiscount(
  auth: TenantAuthContext,
  programId: string,
  invoiceId: string,
  input: { amount: number; reason: string },
): Promise<Result<{ total: number; status: InvoiceStatus }>> {
  const { tenantId } = auth.tenant;
  const actorUserId = auth.userId;
  return change(
    auth,
    programId,
    "people",
    async ({ tx, viewer }) => {
      await tx.$queryRaw`SELECT "id" FROM "ProgramInvoice" WHERE "tenantId" = ${tenantId} AND "id" = ${invoiceId} AND "programId" = ${programId} FOR UPDATE`;
      const invoice = await tx.programInvoice.findFirst({
        where: { tenantId, id: invoiceId, programId },
        include: { discounts: { select: { amount: true } } },
      });
      if (!invoice || !mayTouchInvoice(viewer, invoice.campusId)) return refuse(404, "NOT_FOUND", INVOICE_NOT_FOUND);
      if (invoice.status !== "UNPAID" && invoice.status !== "PARTIALLY_PAID") return refuse(409, "NOT_OPEN", "That invoice is not open.");
      const given = invoice.discounts.reduce((sum, d) => sum + toCents(Number(d.amount)), 0);
      const total = totalAfterDiscounts(linesOf(invoice.lineItems), given + toCents(input.amount));
      const paid = toCents(Number(invoice.amountPaid));
      if (total < paid) return refuse(409, "DISCOUNT_TOO_LARGE", "That discount would take the invoice below what has already been paid.");
      const status = statusOf(total, paid) as InvoiceStatus;
      await tx.programInvoiceDiscount.create({
        data: { tenantId, programId, invoiceId, amount: input.amount, reason: input.reason, appliedByUserId: actorUserId },
      });
      await tx.programInvoice.update({ where: { tenantId, id: invoiceId }, data: { totalAmount: fromCents(total), status } });
      await writeAudit(tx, tenantId, {
        programId,
        actorUserId,
        action: "DISCOUNT_APPLIED",
        targetType: "Invoice",
        targetId: invoiceId,
        after: { amount: input.amount, total: fromCents(total) },
        reason: input.reason,
      });
      return done({ total: fromCents(total), status });
    },
    { allowArchived: true },
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Reports

export type FeeTotals = { billed: number; collected: number; outstanding: number; rate: number | null; invoices: number };
const totalsOf = (rows: { billed: number; collected: number }[]): FeeTotals => {
  const billed = rows.reduce((s, r) => s + r.billed, 0);
  const collected = rows.reduce((s, r) => s + r.collected, 0);
  return {
    billed: fromCents(billed),
    collected: fromCents(collected),
    outstanding: fromCents(billed - collected),
    rate: collectionRate(collected, billed),
    invoices: rows.length,
  };
};
const REPORT_MAX = 20_000;

/// Collected, outstanding and the collection rate, overall and per campus and per group, and the people who owe - among the invoices the caller may see.
export async function feesReport(
  auth: TenantAuthContext,
  programId: string,
): Promise<
  Result<{
    totals: FeeTotals;
    byCampus: (FeeTotals & { campusId: string; name: string })[];
    byGroup: (FeeTotals & { groupId: string; path: string })[];
    owing: { participantId: string; name: string; groupPath: string; outstanding: number; invoices: number }[];
    truncated: boolean;
  }>
> {
  const { tenantId } = auth.tenant;
  const actorUserId = auth.userId;
  return readingFees(auth, programId, async ({ tx, viewer, reach }) => {
    const groups = await groupsOf(tx, tenantId, programId);
    const links = (await tx.campus.findMany({ where: { tenantId }, select: { id: true, name: true } })).map((campus) => ({ campus }));
    const rows = await tx.programInvoice.findMany({
      where: { tenantId, programId, AND: [invoiceReach(reach)] },
      include: personInclude,
      take: REPORT_MAX + 1,
    });
    const truncated = rows.length > REPORT_MAX;
    const facts = rows
      .slice(0, REPORT_MAX)
      .map((r) => ({ row: r, billed: toCents(Number(r.totalAmount)), collected: toCents(Number(r.amountPaid)) }));
    const byCampus = links
      .map((l) => ({ campusId: l.campus.id, name: l.campus.name, ...totalsOf(facts.filter((f) => f.row.campusId === l.campus.id)) }))
      .filter((b) => reach.all || reach.campusIds.includes(b.campusId))
      .sort((a, b) => a.name.localeCompare(b.name));
    const groupIds = [...new Set(facts.map((f) => f.row.participant.groupId))];
    const byGroup = groupIds
      .map((groupId) => ({
        groupId,
        path: groupPath(groups, groupId),
        ...totalsOf(facts.filter((f) => f.row.participant.groupId === groupId)),
      }))
      .sort((a, b) => a.path.localeCompare(b.path));
    const owingBy = new Map<string, { participantId: string; name: string; groupPath: string; cents: number; invoices: number }>();
    for (const f of facts) {
      const left = f.billed - f.collected;
      if (left <= 0) continue;
      const entry = owingBy.get(f.row.participantId) ?? {
        participantId: f.row.participantId,
        name: personName(f.row.participant),
        groupPath: groupPath(groups, f.row.participant.groupId),
        cents: 0,
        invoices: 0,
      };
      entry.cents += left;
      entry.invoices += 1;
      owingBy.set(f.row.participantId, entry);
    }
    const owing = [...owingBy.values()]
      .sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name))
      .slice(0, 200)
      .map((e) => ({
        participantId: e.participantId,
        name: e.name,
        groupPath: e.groupPath,
        outstanding: fromCents(e.cents),
        invoices: e.invoices,
      }));
    return done({ totals: totalsOf(facts), byCampus, byGroup, owing, truncated });
  });
}

/// People who owe money, for slice P5's warning before completing. Not limited by reach: the caller completes places and is an administrator.
export async function owingByPerson(tx: Tx, tenantId: string, programId: string): Promise<Map<string, number>> {
  const rows = await tx.programInvoice.findMany({
    where: { tenantId, programId, status: { in: ["UNPAID", "PARTIALLY_PAID"] } },
    select: { participantId: true, totalAmount: true, amountPaid: true },
  });
  const out = new Map<string, number>();
  for (const r of rows)
    out.set(r.participantId, (out.get(r.participantId) ?? 0) + toCents(Number(r.totalAmount)) - toCents(Number(r.amountPaid)));
  return out;
}
