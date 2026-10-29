import "../support/env";
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { TEST_DATABASE_URL } from "../support/env";
import { addMembership, createTenant, createUser, db, removeCreatedTenants, Role, type TestTenant } from "../support/db";
import { prisma } from "@/lib/db";
import { forTenant } from "@/lib/tenant/for-tenant";
import { trustedTenantId } from "@/lib/tenant/verified-tenant";
import { STORE_NAMES } from "@/lib/storage/types";

// The question bank's tables (task 0024, migration 20261101090000_question_bank): the database itself refuses what the design says must never happen, whichever code writes, and
// keeps one school's questions from ever reaching another's. Written before any service code, so the service is built to fit rules that already hold.
//   - the migration is additive and every table has row-level security in the same file;
//   - a fifth image, an image with no description, a rating question in the assessment bank, a subject reviewer without a subject, a duplicate reviewer or setting, a switch
//     changed without a fresh re-authentication, an approved item that does not say who approved it;
//   - any change to or removal of a review, a version or an audit row (a school being removed as a whole is the one exception);
//   - visibility only moves forward, in UTC;
//   - a row can never point into another school: composite keys, and policies for the runtime role.

let a: TestTenant;
let b: TestTenant;
let teacherA: { id: string };
let teacherB: { id: string };
let adminA: { id: string };
const campus = () => a.campuses[0].id;

test.beforeAll(async () => {
  a = await createTenant({ name: "Bank Alpha", campuses: ["A one", "A two"] });
  b = await createTenant({ name: "Bank Beta", campuses: ["B one"] });
  teacherA = await createUser();
  adminA = await createUser();
  teacherB = await createUser();
  await addMembership(teacherA.id, a.id, Role.TEACHING_STAFF);
  await addMembership(adminA.id, a.id, Role.ADMIN);
  await addMembership(teacherB.id, b.id, Role.TEACHING_STAFF);
});
test.afterAll(async () => {
  await removeCreatedTenants();
});
test.beforeEach(async () => {
  await db.$executeRawUnsafe(
    `TRUNCATE "QuestionBankAudit", "QuestionBankReview", "QuestionBankItemVersion", "QuestionOverlapFlag", "QuestionBankImage", "QuestionBankClassTag", "QuestionBankItem", "QuestionBankReviewer", "QuestionBankSetting" RESTART IDENTITY CASCADE`,
  );
});

const rejects = async (p: Promise<unknown>, message?: RegExp) => {
  if (message) await expect(p).rejects.toThrow(message);
  else await expect(p).rejects.toThrow();
};
const item = (over: Record<string, unknown> = {}) =>
  db.questionBankItem.create({
    data: { tenantId: a.id, campusId: campus(), type: "SINGLE", prompt: "What is 2 + 2?", submittedById: teacherA.id, ...over },
  });
const image = (itemId: string, over: Record<string, unknown> = {}) =>
  db.questionBankImage.create({
    data: {
      tenantId: a.id,
      itemId,
      storageKey: `k/${Math.random()}`,
      store: "memory",
      contentType: "image/png",
      alt: "A diagram",
      bytes: 1000,
      width: 100,
      height: 100,
      sortOrder: 0,
      ...over,
    },
  });
const inFuture = (ms = 3_600_000) => new Date(Date.now() + ms);

test.describe("the migration is additive", () => {
  const sql = readFileSync(join(process.cwd(), "prisma", "migrations", "20261101090000_question_bank", "migration.sql"), "utf8");
  const statements = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  test("it creates 6 enums and 9 tables, and everything else it touches is a new question bank table", () => {
    expect(statements.match(/^CREATE TYPE /gm)).toHaveLength(6);
    expect(statements.match(/^CREATE TABLE /gm)).toHaveLength(9);
    const created = [...statements.matchAll(/^CREATE TABLE "([^"]+)"/gm)].map((m) => m[1]);
    for (const table of created) expect(table, table).toMatch(/^Question(Bank|Overlap)/);
    const touched = [
      ...statements.matchAll(/^(?:ALTER TABLE|CREATE (?:UNIQUE )?INDEX "[^"]+" ON|CREATE TRIGGER "[^"]+" [A-Z ]+(?: OF [^O]+)? ON|CREATE POLICY \w+ ON)\s+"([^"]+)"/gm),
    ].map((m) => m[1]);
    expect(touched.length).toBeGreaterThan(30);
    for (const table of touched) expect(created, table).toContain(table);
  });

  test("it never drops, updates, deletes or inserts anything", () => {
    expect(statements).not.toMatch(/^\s*(DROP|DELETE|UPDATE|INSERT|TRUNCATE)\b/im);
  });

  test("every table has row-level security enabled AND forced in the same file, and there is no policy that lets the application delete an item", () => {
    const created = [...statements.matchAll(/^CREATE TABLE "([^"]+)"/gm)].map((m) => m[1]);
    for (const table of created) {
      expect(statements, table).toContain(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;`);
      expect(statements, table).toContain(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY;`);
    }
    expect(statements).not.toMatch(/CREATE POLICY \w+ ON "QuestionBankItem" FOR DELETE/);
  });

  test("the list of stores in the database check is exactly the list of stores the code knows", () => {
    const listed = statements.match(/"store" IN \(([^)]*)\)/)?.[1] ?? "";
    expect([...listed.matchAll(/'([a-z0-9]+)'/g)].map((m) => m[1]).sort()).toEqual([...STORE_NAMES].sort());
  });
});

test.describe("fail-closed defaults and item rules", () => {
  test("an item nobody classified is a TEACHERS_ONLY draft, version 1, with no options; a general item (no campus) is allowed", async () => {
    const q = await item();
    expect(q).toMatchObject({ status: "DRAFT", visibility: "TEACHERS_ONLY", version: 1, bank: "ASSESSMENT", points: 1, campusId: campus() });
    expect(q.options).toEqual([]);
    const general = await item({ campusId: null });
    expect(general.campusId).toBeNull();
  });

  test("a campus of ANOTHER school is not a campus of this one, for an item, a reviewer, a setting or an audit row", async () => {
    await rejects(item({ campusId: b.campuses[0].id }), /foreign key|violates/i);
    await rejects(db.questionBankReviewer.create({ data: { tenantId: a.id, userId: teacherA.id, campusId: b.campuses[0].id, scope: "GENERAL", assignedById: adminA.id } }), /foreign key|violates/i);
    await rejects(db.questionBankSetting.create({ data: { tenantId: a.id, campusId: b.campuses[0].id, key: "bank.access.staff", value: false, updatedById: adminA.id } }), /foreign key|violates/i);
    await rejects(db.questionBankAudit.create({ data: { tenantId: a.id, campusId: b.campuses[0].id, entity: "ITEM", action: "X" } }), /foreign key|violates/i);
  });

  test("a person who is not a member of this school cannot write, approve or review: the person is a membership, not just a user", async () => {
    await rejects(item({ submittedById: teacherB.id }), /foreign key|violates/i);
    const q = await item();
    await rejects(db.questionBankItem.update({ where: { id: q.id }, data: { approvedById: teacherB.id } }), /foreign key|violates/i);
    await rejects(db.questionBankReview.create({ data: { tenantId: a.id, itemId: q.id, version: 1, reviewerId: teacherB.id, outcome: "APPROVED" } }), /foreign key|violates/i);
    await rejects(db.questionBankReviewer.create({ data: { tenantId: a.id, userId: teacherB.id, scope: "GENERAL", assignedById: adminA.id } }), /foreign key|violates/i);
  });

  test("blank prompt, negative points, version 0 and difficulty outside 1 to 5 are refused", async () => {
    for (const prompt of ["", "   ", "\n\t", "  "]) await rejects(item({ prompt }), /QuestionBankItem_sane/);
    await rejects(item({ points: -1 }), /QuestionBankItem_sane/);
    await rejects(item({ version: 0 }), /QuestionBankItem_sane/);
    for (const difficulty of [0, 6, -1]) await rejects(item({ difficulty }), /QuestionBankItem_sane/);
    for (const difficulty of [1, 5, null]) expect((await item({ difficulty })).difficulty).toBe(difficulty);
  });

  test("a subject label and its key come together, and the key is not empty", async () => {
    await rejects(item({ subjectLabel: "Maths" }), /QuestionBankItem_sane/);
    await rejects(item({ subjectKey: "maths" }), /QuestionBankItem_sane/);
    await rejects(item({ subjectLabel: "Maths", subjectKey: "" }), /QuestionBankItem_sane/);
    expect((await item({ subjectLabel: "Maths", subjectKey: "maths" })).subjectKey).toBe("maths");
  });

  test("rating and free text belong to the questionnaire bank; a questionnaire item has no correct answer", async () => {
    await rejects(item({ type: "RATING" }), /QuestionBankItem_kind_types/);
    await rejects(item({ type: "TEXT" }), /QuestionBankItem_kind_types/);
    expect((await item({ type: "RATING", bank: "QUESTIONNAIRE" })).type).toBe("RATING");
    await rejects(item({ type: "SINGLE", bank: "QUESTIONNAIRE", correctAnswer: "o1" }), /QuestionBankItem_kind_types/);
  });

  test("a school's items are never deleted by the application's own role: there is no delete policy", async () => {
    const q = await item();
    const runtime = await forTenant(trustedTenantId(a.id)).transaction((tx) => tx.questionBankItem.deleteMany({ where: { id: q.id } }));
    expect(runtime.count).toBe(0);
    expect(await db.questionBankItem.count({ where: { id: q.id } })).toBe(1);
  });
});

test.describe("images: at most 4, alt text required, where they are and what they are", () => {
  test("a fifth image is refused by the database, whatever its position; removing one makes room", async () => {
    const q = await item();
    for (let i = 0; i < 4; i++) await image(q.id, { sortOrder: i });
    await rejects(image(q.id, { sortOrder: 4 }), /at most 4 images/);
    await rejects(image(q.id, { sortOrder: 9 }), /at most 4 images/);
    await db.questionBankImage.deleteMany({ where: { itemId: q.id, sortOrder: 0 } });
    expect((await image(q.id, { sortOrder: 7 })).sortOrder).toBe(7);
  });

  test("concurrent inserts cannot slip past the limit (the parent row is locked)", async () => {
    const q = await item();
    for (let i = 0; i < 3; i++) await image(q.id, { sortOrder: i });
    const results = await Promise.allSettled([3, 4, 5, 6].map((sortOrder) => image(q.id, { sortOrder })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.questionBankImage.count({ where: { itemId: q.id } })).toBe(4);
  });

  test("two images cannot share a position or a stored file; an image cannot point at another school's item", async () => {
    const q = await item();
    await image(q.id, { storageKey: "same/key", sortOrder: 0 });
    await rejects(image(q.id, { storageKey: "other/key", sortOrder: 0 }), /unique/i);
    await rejects(image(q.id, { storageKey: "same/key", sortOrder: 1 }), /unique/i);
    await rejects(db.questionBankImage.create({ data: { tenantId: b.id, itemId: q.id, storageKey: "x/1", store: "memory", contentType: "image/png", alt: "x", bytes: 1, width: 1, height: 1, sortOrder: 3 } }), /foreign key|violates/i);
  });

  test("alt text is required unless the image is decorative; sizes must be positive; a store and a type are known ones", async () => {
    const q = await item();
    for (const alt of ["", "   ", "\n", " "]) await rejects(image(q.id, { alt }), /QuestionBankImage_sane/);
    expect((await image(q.id, { alt: "", decorative: true, sortOrder: 1 })).decorative).toBe(true);
    for (const bad of [{ bytes: 0 }, { width: 0 }, { height: -1 }, { sortOrder: -1 }]) await rejects(image(q.id, bad), /QuestionBankImage_sane/);
    for (const store of ["", "S3", "gcs", "file", "memory "]) await rejects(image(q.id, { store, sortOrder: 2 }), /QuestionBankImage_store/);
    for (const contentType of ["", "image/gif", "image/svg+xml", "text/html", "IMAGE/PNG"]) await rejects(image(q.id, { contentType, sortOrder: 2 }), /QuestionBankImage_contentType/);
    const fresh = await item({ prompt: "Every store" });
    for (const [i, store] of STORE_NAMES.entries()) expect((await image(fresh.id, { store, storageKey: `s/${store}`, sortOrder: i })).store).toBe(store);
  });

  test("the application's role can add and remove pictures but not edit one; another school's cannot be touched", async () => {
    const q = await item();
    const pic = await image(q.id);
    const edited = await forTenant(trustedTenantId(a.id)).transaction((tx) => tx.questionBankImage.updateMany({ where: { id: pic.id }, data: { alt: "edited" } }));
    expect(edited.count).toBe(0);
    const foreign = await forTenant(trustedTenantId(b.id)).transaction((tx) => tx.questionBankImage.deleteMany({ where: { id: pic.id } }));
    expect(foreign.count).toBe(0);
    const removed = await forTenant(trustedTenantId(a.id)).transaction((tx) => tx.questionBankImage.deleteMany({ where: { id: pic.id } }));
    expect(removed.count).toBe(1);
  });
});

test.describe("class tags", () => {
  test("one key per item, the key is not empty, and another item may use the same key", async () => {
    const q1 = await item();
    const q2 = await item({ prompt: "Another" });
    const tag = (itemId: string, label: string, labelKey: string) => db.questionBankClassTag.create({ data: { tenantId: a.id, itemId, label, labelKey } });
    await tag(q1.id, "JSS 1", "jss1");
    await rejects(tag(q1.id, "jss-1", "jss1"), /unique/i);
    await rejects(tag(q1.id, "?", ""), /QuestionBankClassTag_sane/);
    await rejects(tag(q1.id, "  ", "x"), /QuestionBankClassTag_sane/);
    await tag(q2.id, "JSS 1", "jss1");
    expect(await db.questionBankClassTag.count()).toBe(2);
  });
});

test.describe("reviewers and settings", () => {
  const reviewer = (userId: string, over: Record<string, unknown> = {}) =>
    db.questionBankReviewer.create({ data: { tenantId: a.id, userId, campusId: campus(), scope: "GENERAL", assignedById: adminA.id, ...over } });

  test("a subject reviewer needs a subject and a general one must not have one", async () => {
    await rejects(reviewer(teacherA.id, { scope: "SUBJECT" }), /QuestionBankReviewer_scope/);
    await rejects(reviewer(teacherA.id, { scope: "SUBJECT", subjectLabel: "Maths" }), /QuestionBankReviewer_scope/);
    await rejects(reviewer(teacherA.id, { scope: "SUBJECT", subjectLabel: "Maths", subjectKey: "" }), /QuestionBankReviewer_scope/);
    await rejects(reviewer(teacherA.id, { scope: "GENERAL", subjectLabel: "Maths", subjectKey: "maths" }), /QuestionBankReviewer_scope/);
    expect((await reviewer(teacherA.id, { scope: "SUBJECT", subjectLabel: "Maths", subjectKey: "maths" })).scope).toBe("SUBJECT");
  });

  test("one row per person, campus, scope and subject, including for every-campus (null) rows", async () => {
    await reviewer(teacherA.id);
    await rejects(reviewer(teacherA.id), /unique/i);
    await reviewer(teacherA.id, { campusId: null });
    await rejects(reviewer(teacherA.id, { campusId: null }), /unique/i);
    await reviewer(teacherA.id, { campusId: a.campuses[1].id });
    await reviewer(teacherA.id, { scope: "SUBJECT", subjectLabel: "Maths", subjectKey: "maths" });
    await rejects(reviewer(teacherA.id, { scope: "SUBJECT", subjectLabel: "MATHS", subjectKey: "maths" }), /unique/i);
    expect(await db.questionBankReviewer.count({ where: { userId: teacherA.id } })).toBe(4);
    expect((await reviewer(adminA.id)).isExamApprover).toBe(false);
  });

  test("a reviewer row goes when the person's membership goes", async () => {
    const row = await reviewer(teacherA.id);
    await db.tenantMembership.delete({ where: { userId_tenantId: { userId: teacherA.id, tenantId: a.id } } });
    expect(await db.questionBankReviewer.count({ where: { id: row.id } })).toBe(0);
    await addMembership(teacherA.id, a.id, Role.TEACHING_STAFF); // the other tests need her back
  });

  test("one value per school, campus and key; the key is a bank key; campus and school values sit side by side", async () => {
    const set = (over: Record<string, unknown> = {}) =>
      db.questionBankSetting.create({ data: { tenantId: a.id, campusId: null, key: "bank.access.staff", value: false, updatedById: adminA.id, ...over } });
    await set();
    await rejects(set(), /unique/i);
    await set({ campusId: campus() });
    await rejects(set({ campusId: campus(), value: true }), /unique/i);
    await set({ key: "bank.images.max", value: 4 });
    for (const key of ["", "access.staff", "BANK.access", `bank.${"x".repeat(80)}`]) await rejects(set({ key }), /QuestionBankSetting_key/);
    expect(await db.questionBankSetting.count()).toBe(3);
  });
});

test.describe("append-only history", () => {
  test("a review cannot be changed or removed, and an item with reviews cannot be deleted", async () => {
    const q = await item();
    const review = await db.questionBankReview.create({ data: { tenantId: a.id, itemId: q.id, version: 1, reviewerId: adminA.id, outcome: "APPROVED", reason: "ok" } });
    await rejects(db.questionBankReview.update({ where: { id: review.id }, data: { reason: "changed my mind" } }), /append-only/);
    await rejects(db.questionBankReview.delete({ where: { id: review.id } }), /append-only/);
    await rejects(db.questionBankReview.deleteMany({ where: { itemId: q.id } }), /append-only/);
    await rejects(db.questionBankItem.delete({ where: { id: q.id } }), /foreign key|violates/i);
    expect((await db.questionBankReview.findUniqueOrThrow({ where: { id: review.id } })).reason).toBe("ok");
  });

  test("a version has a number from 1, a snapshot that is a JSON object, an author, is unique per item, and is never changed", async () => {
    const q = await item();
    const version = (over: Record<string, unknown> = {}) =>
      db.questionBankItemVersion.create({ data: { tenantId: a.id, itemId: q.id, version: 1, snapshot: { prompt: "x" }, actorUserId: teacherA.id, ...over } });
    await rejects(version({ version: 0 }), /QuestionBankItemVersion_sane/);
    await rejects(version({ snapshot: [1, 2] }), /QuestionBankItemVersion_sane/);
    await rejects(version({ snapshot: "text" }), /QuestionBankItemVersion_sane/);
    await rejects(version({ actorUserId: teacherB.id }), /foreign key|violates/i);
    const v1 = await version();
    await rejects(version(), /unique/i);
    await rejects(db.questionBankItemVersion.update({ where: { id: v1.id }, data: { snapshot: { prompt: "y" } } }), /append-only/);
    await rejects(db.questionBankItemVersion.delete({ where: { id: v1.id } }), /append-only/);
    await rejects(db.questionBankItem.delete({ where: { id: q.id } }), /foreign key|violates/i);
  });

  test("an audit row cannot be changed or removed; entity must be known; a switch change says when the person last proved who they are", async () => {
    const row = await db.questionBankAudit.create({
      data: { tenantId: a.id, campusId: null, actorUserId: adminA.id, entity: "SETTING", action: "CHANGED", ref: "bank.images.max", oldValue: 3, newValue: 4, stepUpVerifiedAt: new Date() },
    });
    expect(row.campusId).toBeNull();
    await rejects(db.questionBankAudit.update({ where: { id: row.id }, data: { action: "x" } }), /append-only/);
    await rejects(db.questionBankAudit.delete({ where: { id: row.id } }), /append-only/);
    await rejects(db.questionBankAudit.updateMany({ data: { reason: "x" } }), /append-only/);
    await rejects(db.questionBankAudit.create({ data: { tenantId: a.id, entity: "NOPE", action: "x" } }), /QuestionBankAudit_entity/);
    await rejects(db.questionBankAudit.create({ data: { tenantId: a.id, entity: "SETTING", action: "CHANGED", ref: "bank.images.max" } }), /QuestionBankAudit_step_up/);
    await db.questionBankAudit.create({ data: { tenantId: a.id, campusId: campus(), itemId: "gone-later", entity: "ITEM", action: "APPROVED" } }); // itemId has no foreign key on purpose
    expect(await db.questionBankAudit.count()).toBe(2);
  });

  test("a campus with an audit trail cannot be deleted from under it, but a whole school can be removed (the cascade is the one exception)", async () => {
    await db.questionBankAudit.create({ data: { tenantId: a.id, campusId: campus(), entity: "REVIEWER", action: "ASSIGNED" } });
    await rejects(db.campus.delete({ where: { id: campus() } }), /foreign key|violates/i);

    const gone = await createTenant({ name: "Removed School", campuses: ["Only"] });
    const writer = await createUser();
    await addMembership(writer.id, gone.id, Role.TEACHING_STAFF);
    const q = await db.questionBankItem.create({ data: { tenantId: gone.id, campusId: gone.campuses[0].id, type: "SINGLE", prompt: "Q", submittedById: writer.id } });
    await db.questionBankReview.create({ data: { tenantId: gone.id, itemId: q.id, version: 1, reviewerId: writer.id, outcome: "EDITED" } });
    await db.questionBankItemVersion.create({ data: { tenantId: gone.id, itemId: q.id, version: 1, snapshot: {}, actorUserId: writer.id } });
    await db.questionBankAudit.create({ data: { tenantId: gone.id, itemId: q.id, entity: "ITEM", action: "CREATED" } });
    await db.tenant.delete({ where: { id: gone.id } });
    expect(await db.questionBankItem.count({ where: { tenantId: gone.id } })).toBe(0);
    expect(await db.questionBankReview.count({ where: { tenantId: gone.id } })).toBe(0);
    expect(await db.questionBankAudit.count({ where: { tenantId: gone.id } })).toBe(0);
  });

  test("a test reset (TRUNCATE) still works with the triggers in place", async () => {
    const q = await item();
    await db.questionBankReview.create({ data: { tenantId: a.id, itemId: q.id, version: 1, reviewerId: adminA.id, outcome: "EDITED" } });
    await db.questionBankAudit.create({ data: { tenantId: a.id, entity: "ITEM", action: "EDITED", itemId: q.id } });
    await db.$executeRawUnsafe(`TRUNCATE "QuestionBankAudit", "QuestionBankReview", "QuestionBankItemVersion", "QuestionBankItem" CASCADE`);
    expect(await db.questionBankReview.count()).toBe(0);
    expect(await db.questionBankAudit.count()).toBe(0);
    expect(await db.questionBankItem.count()).toBe(0);
  });
});

test.describe("overlap flags", () => {
  test("a score is between 0 and 1; a flag belongs to an item and may point at another of the same school, never at another school's", async () => {
    const q1 = await item();
    const q2 = await item({ prompt: "Another question" });
    const flag = (over: Record<string, unknown>) => db.questionOverlapFlag.create({ data: { tenantId: a.id, itemId: q1.id, similarToItemId: q2.id, score: 0.9, ...over } });
    await rejects(flag({ score: 1.2 }), /QuestionOverlapFlag_score/);
    await rejects(flag({ score: -0.1 }), /QuestionOverlapFlag_score/);
    const ok = await flag({ score: 0.93 });
    expect(ok.score).toBeCloseTo(0.93);
    const foreign = await db.questionBankItem.create({ data: { tenantId: b.id, type: "SINGLE", prompt: "B's question", submittedById: teacherB.id } });
    await rejects(flag({ similarToItemId: foreign.id }), /foreign key|violates/i);
    await rejects(db.questionBankItem.delete({ where: { id: q2.id } }), /foreign key|violates/i); // an item that is flagged against is archived, never deleted
  });
});

test.describe("approval", () => {
  test("APPROVED and RETIRED need an approver and a time; RETIRED needs a reason that is not blank", async () => {
    const q = await item();
    await rejects(db.questionBankItem.update({ where: { id: q.id }, data: { status: "APPROVED" } }), /QuestionBankItem_decided/);
    await rejects(db.questionBankItem.update({ where: { id: q.id }, data: { status: "APPROVED", approvedById: adminA.id } }), /QuestionBankItem_decided/);
    const approved = await db.questionBankItem.update({ where: { id: q.id }, data: { status: "APPROVED", approvedById: adminA.id, approvedAt: new Date() } });
    expect(approved.status).toBe("APPROVED");
    for (const retiredReason of [null, "", "   ", " "]) {
      await rejects(db.questionBankItem.update({ where: { id: q.id }, data: { status: "RETIRED", retiredReason } }), /QuestionBankItem_decided/);
    }
    expect((await db.questionBankItem.update({ where: { id: q.id }, data: { status: "RETIRED", retiredReason: "Out of the scheme." } })).status).toBe("RETIRED");
  });
});

test.describe("visibility only moves forward", () => {
  const approved = () => item({ status: "APPROVED", approvedById: adminA.id, approvedAt: new Date() });
  const setVisibility = (id: string, data: Record<string, unknown>) => db.questionBankItem.update({ where: { id }, data });

  test("TEACHERS_ONLY may become TEACHERS_ONLY_UNTIL (a date in the future) or PRACTICE, and PRACTICE may not go back", async () => {
    const q1 = await approved();
    const until = await setVisibility(q1.id, { visibility: "TEACHERS_ONLY_UNTIL", visibleFrom: inFuture() });
    expect(until.visibility).toBe("TEACHERS_ONLY_UNTIL");
    const q2 = await approved();
    expect((await setVisibility(q2.id, { visibility: "PRACTICE" })).visibility).toBe("PRACTICE");
    await rejects(setVisibility(q2.id, { visibility: "TEACHERS_ONLY" }), /never disappear/);
    await rejects(setVisibility(q2.id, { visibility: "TEACHERS_ONLY_UNTIL", visibleFrom: inFuture() }), /never disappear/);
    await rejects(setVisibility(q1.id, { visibility: "TEACHERS_ONLY", visibleFrom: null }), /never disappear/);
  });

  test("while the date is ahead it may move later or earlier but still ahead; a date that is not ahead is refused", async () => {
    const q = await approved();
    await setVisibility(q.id, { visibility: "TEACHERS_ONLY_UNTIL", visibleFrom: inFuture(3_600_000) });
    await setVisibility(q.id, { visibleFrom: inFuture(7_200_000) });
    await setVisibility(q.id, { visibleFrom: inFuture(1_800_000) });
    await rejects(setVisibility(q.id, { visibleFrom: new Date(Date.now() - 1000) }), /must be in the future/);
    await rejects(item({ visibility: "TEACHERS_ONLY_UNTIL", visibleFrom: new Date(Date.now() - 60_000) }), /must be in the future/);
  });

  test("only TEACHERS_ONLY_UNTIL has a date, and it always has one", async () => {
    await rejects(item({ visibility: "TEACHERS_ONLY_UNTIL" }), /QuestionBankItem_until/);
    await rejects(item({ visibility: "PRACTICE", visibleFrom: inFuture() }), /QuestionBankItem_until/);
    await rejects(item({ visibility: "TEACHERS_ONLY", visibleFrom: inFuture() }), /QuestionBankItem_until/);
  });

  test("a date that has passed (visible to pupils) cannot be pushed back or changed, but the question may still go to PRACTICE; retiring touches nothing", async () => {
    const q = await approved();
    await setVisibility(q.id, { visibility: "TEACHERS_ONLY_UNTIL", visibleFrom: inFuture(1500) });
    await new Promise((resolve) => setTimeout(resolve, 2200));
    await rejects(setVisibility(q.id, { visibleFrom: inFuture() }), /its date has passed|must be in the future/);
    await rejects(setVisibility(q.id, { visibility: "TEACHERS_ONLY", visibleFrom: null }), /never disappear/);
    expect((await setVisibility(q.id, { visibility: "PRACTICE", visibleFrom: null })).visibility).toBe("PRACTICE");
    expect((await db.questionBankItem.update({ where: { id: q.id }, data: { status: "RETIRED", retiredReason: "No longer used." } })).visibility).toBe("PRACTICE");
  });

  test("the rule does not depend on the database server's time zone: the dates are UTC, whatever zone the session is in", async () => {
    for (const zone of ["UTC", "Africa/Lagos", "America/Los_Angeles", "Pacific/Kiritimati"]) {
      const client = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });
      try {
        const q = await approved();
        await client.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`SET LOCAL TIME ZONE '${zone}'`);
          await tx.questionBankItem.update({ where: { id: q.id }, data: { visibility: "TEACHERS_ONLY_UNTIL", visibleFrom: inFuture(30 * 60_000) } });
        });
        await client.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`SET LOCAL TIME ZONE '${zone}'`);
          await expect(tx.questionBankItem.update({ where: { id: q.id }, data: { visibleFrom: new Date(Date.now() - 30 * 60_000) } })).rejects.toThrow(/must be in the future/);
        });
      } finally {
        await client.$disconnect();
      }
    }
  });
});

// ---- row-level security, as the role the application runs as -------------------------------------------------------------------------------------------------------------
const violation = /row-level security|violates|permission denied/i;
const asTenant = <T>(t: TestTenant, fn: Parameters<ReturnType<typeof forTenant>["transaction"]>[0]) => forTenant(trustedTenantId(t.id)).transaction(fn) as Promise<T>;

test.describe("one school never reaches another's questions", () => {
  const TABLES = ["QuestionBankItem", "QuestionBankImage", "QuestionBankItemVersion", "QuestionBankClassTag", "QuestionBankReview", "QuestionBankReviewer", "QuestionOverlapFlag", "QuestionBankAudit", "QuestionBankSetting"];
  const ids: Record<"a" | "b", { item: string; image: string; setting: string }> = { a: { item: "", image: "", setting: "" }, b: { item: "", image: "", setting: "" } };

  test.beforeEach(async () => {
    for (const [key, t, teacher, admin] of [
      ["a", a, teacherA, adminA],
      ["b", b, teacherB, teacherB],
    ] as const) {
      const q = await db.questionBankItem.create({ data: { tenantId: t.id, campusId: t.campuses[0].id, type: "SINGLE", prompt: `Question of ${key}`, submittedById: teacher.id } });
      const pic = await db.questionBankImage.create({ data: { tenantId: t.id, itemId: q.id, storageKey: `${key}/1`, store: "memory", contentType: "image/png", alt: "x", bytes: 1, width: 1, height: 1 } });
      await db.questionBankClassTag.create({ data: { tenantId: t.id, itemId: q.id, label: "JSS 1", labelKey: "jss1" } });
      await db.questionBankItemVersion.create({ data: { tenantId: t.id, itemId: q.id, version: 1, snapshot: {}, actorUserId: teacher.id } });
      await db.questionBankReview.create({ data: { tenantId: t.id, itemId: q.id, version: 1, reviewerId: admin.id, outcome: "EDITED" } });
      await db.questionBankReviewer.create({ data: { tenantId: t.id, userId: teacher.id, scope: "GENERAL", assignedById: admin.id } });
      await db.questionBankAudit.create({ data: { tenantId: t.id, itemId: q.id, entity: "ITEM", action: "CREATED" } });
      const setting = await db.questionBankSetting.create({ data: { tenantId: t.id, key: "bank.access.staff", value: false, updatedById: admin.id } });
      ids[key] = { item: q.id, image: pic.id, setting: setting.id };
    }
    await db.questionOverlapFlag.create({ data: { tenantId: a.id, itemId: ids.a.item, score: 0.9 } });
  });

  test("with no school in context the runtime role sees no row of any question bank table, though the rows exist", async () => {
    for (const table of TABLES) {
      expect(await db.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM "${table}"`), table).not.toEqual([{ n: 0 }]);
      expect(await prisma.$queryRawUnsafe(`SELECT 1 FROM "${table}"`), table).toEqual([]);
    }
  });

  test("a school reads ITS rows in every table and never another's, and a guessed id is simply not there", async () => {
    for (const table of TABLES) {
      const rows = await asTenant<{ tenantId: string }[]>(a, (tx) => tx.$queryRawUnsafe(`SELECT "tenantId" FROM "${table}"`));
      expect(rows.length, table).toBeGreaterThan(0);
      expect(rows.every((r) => r.tenantId === a.id), table).toBe(true);
    }
    expect(await asTenant(a, (tx) => tx.questionBankItem.findUnique({ where: { id: ids.b.item } }))).toBeNull();
    expect(await asTenant(a, (tx) => tx.questionBankImage.findUnique({ where: { id: ids.b.image } }))).toBeNull();
    expect(await asTenant(a, (tx) => tx.questionBankSetting.findUnique({ where: { id: ids.b.setting } }))).toBeNull();
  });

  test("WITH CHECK: A's context cannot create an item, a setting or a review for B, nor move its own item to B", async () => {
    await expect(asTenant(a, (tx) => tx.questionBankItem.createMany({ data: [{ tenantId: b.id, type: "SINGLE", prompt: "Smuggled", submittedById: teacherB.id }] }))).rejects.toThrow(violation);
    await expect(asTenant(a, (tx) => tx.questionBankSetting.createMany({ data: [{ tenantId: b.id, key: "bank.access.staff", value: true, updatedById: teacherB.id }] }))).rejects.toThrow(violation);
    await expect(asTenant(a, (tx) => tx.questionBankItem.updateMany({ where: { id: ids.a.item }, data: { tenantId: b.id } }))).rejects.toThrow(violation);
  });

  test("an item can be edited by its school, never by another; images, tags and flags are replaced as sets; reviewers and settings are removed; history is only added to", async () => {
    const own = await asTenant<{ count: number }>(a, (tx) => tx.questionBankItem.updateMany({ where: { id: ids.a.item }, data: { prompt: "Edited" } }));
    expect(own.count).toBe(1);
    const foreign = await asTenant<{ count: number }>(a, (tx) => tx.questionBankItem.updateMany({ where: { id: ids.b.item }, data: { prompt: "taken" } }));
    expect(foreign.count).toBe(0);
    expect((await db.questionBankItem.findUniqueOrThrow({ where: { id: ids.b.item } })).prompt).toBe("Question of b");

    for (const model of ["questionBankImage", "questionBankClassTag", "questionOverlapFlag", "questionBankReviewer"] as const) {
      const removed = await asTenant<{ count: number }>(a, (tx) => (tx[model] as unknown as { deleteMany: (a: unknown) => Promise<{ count: number }> }).deleteMany({ where: { tenantId: { in: [a.id, b.id] } } }));
      expect(removed.count, model).toBeGreaterThan(0);
      expect(await (db[model] as unknown as { count: (a: unknown) => Promise<number> }).count({ where: { tenantId: b.id } }), `${model} of B`).toBe(model === "questionOverlapFlag" ? 0 : 1);
    }
    for (const model of ["questionBankReview", "questionBankItemVersion", "questionBankAudit"] as const) {
      // no policy lets the role see a row of these to delete, update or remove it: nothing is touched, and the trigger behind it is a second lock
      const delegate = (client: unknown) => client as { deleteMany: (a: unknown) => Promise<{ count: number }>; updateMany: (a: unknown) => Promise<{ count: number }> };
      expect((await asTenant<{ count: number }>(a, (tx) => delegate(tx[model]).deleteMany({ where: {} }))).count, `${model} delete`).toBe(0);
      expect((await asTenant<{ count: number }>(a, (tx) => delegate(tx[model]).updateMany({ where: {}, data: { tenantId: a.id } }))).count, `${model} update`).toBe(0);
    }
    expect(await db.questionBankAudit.count({ where: { tenantId: a.id } })).toBe(1);
    const settings = await asTenant<{ count: number }>(a, (tx) => tx.questionBankSetting.deleteMany({ where: { tenantId: { in: [a.id, b.id] } } }));
    expect(settings.count).toBe(1); // A's own only
    expect(await db.questionBankSetting.count({ where: { tenantId: b.id } })).toBe(1);
  });
});
