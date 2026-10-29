import "../support/env";
import crypto from "node:crypto";
import { test, expect } from "@playwright/test";
import { Role } from "@prisma/client";
import { addMembership, createTenant, createUser, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { prisma } from "@/lib/db";
import { forShareToken, setShareContext, setTenantContext } from "@/lib/tenant/for-tenant";
import { trustedTenantId } from "@/lib/tenant/verified-tenant";

// The share context of a public survey link (migration 20261102150000): run as `app_user`, like the application. A link holds a token and no session, so the database must let a
// caller who holds the token read THE ONE published questionnaire it belongs to, and nothing else: not a draft, not another kind of form, not another survey, not another school's
// rows, and nothing written. The school's own policies are the only way to read the questions and write the answers, once the school context has been set from the row found.

const violation = /row-level security|violates|permission denied/i;
const token = () => crypto.randomBytes(16).toString("hex");

let a: TestTenant;
let b: TestTenant;
let creator: { id: string };
const ids = {} as Record<string, string>;
const tokens = {} as Record<string, string>;

async function form(t: TestTenant, key: string, over: Record<string, unknown> = {}) {
  tokens[key] = token();
  const f = await db.form.create({
    data: {
      tenantId: t.id,
      kind: "QUESTIONNAIRE",
      title: key,
      status: "PUBLISHED",
      shareToken: tokens[key],
      createdById: creator.id,
      ...over,
    } as never,
  });
  ids[key] = f.id;
  await db.formQuestion.create({ data: { tenantId: t.id, formId: f.id, prompt: `Question of ${key}`, points: 0 } });
  return f;
}

test.beforeAll(async () => {
  await seedInstance();
  a = await createTenant({ name: "Share Alpha", campuses: ["A one"] });
  b = await createTenant({ name: "Share Beta", campuses: ["B one"] });
  const user = await createUser();
  creator = user;
  await addMembership(user.id, a.id, Role.ADMIN);
  await addMembership(user.id, b.id, Role.ADMIN);
  await form(a, "live");
  await form(a, "other");
  await form(a, "draft", { status: "DRAFT" });
  await form(a, "closed", { status: "CLOSED" });
  await form(a, "practice", { kind: "PRACTICE_SET" });
  await form(b, "foreign");
});
test.afterAll(async () => {
  await removeCreatedTenants();
});

test.describe("what a token reaches", () => {
  test("exactly the one published questionnaire it belongs to", async () => {
    const rows = await forShareToken(tokens.live).transaction((tx) => tx.form.findMany());
    expect(rows.map((r) => r.id)).toEqual([ids.live]);
    const other = await forShareToken(tokens.foreign).transaction((tx) => tx.form.findMany());
    expect(other.map((r) => r.id)).toEqual([ids.foreign]); // another school's: the token alone names it
  });

  test("not a draft, a closed survey or another kind of form, even with its own token", async () => {
    for (const key of ["draft", "closed", "practice"]) {
      expect(await forShareToken(tokens[key]).transaction((tx) => tx.form.findMany())).toEqual([]);
    }
  });

  test("no token, a token nobody holds, and a token for one form do not reach another", async () => {
    expect(await prisma.form.findMany({ where: { tenantId: a.id } })).toEqual([]); // no context at all
    expect(await forShareToken(token()).transaction((tx) => tx.form.findMany())).toEqual([]);
    const found = await forShareToken(tokens.live).transaction((tx) => tx.form.findUnique({ where: { shareToken: tokens.other } }));
    expect(found).toBeNull();
  });

  test("none of the survey's other tables are reached by the token alone", async () => {
    await forShareToken(tokens.live).transaction(async (tx) => {
      expect(await tx.formQuestion.findMany()).toEqual([]);
      expect(await tx.formAudience.findMany()).toEqual([]);
      expect(await tx.formResponse.findMany()).toEqual([]);
      expect(await tx.formAnswer.findMany()).toEqual([]);
      expect(await tx.formParticipation.findMany()).toEqual([]);
    });
  });

  test("a token that is not a token is refused before it reaches SQL", async () => {
    for (const bad of ["", "xyz", "A".repeat(32), `${token()}0`, "0".repeat(31), "'; select 1 --"]) {
      await expect(forShareToken(bad).transaction((tx) => tx.form.findMany())).rejects.toThrow(/not a valid share token/);
    }
    await expect(prisma.$transaction((tx) => setShareContext(tx, "nope"))).rejects.toThrow(/not a valid share token/);
  });
});

test.describe("what a token does not allow", () => {
  test("nothing is written through it", async () => {
    await expect(
      forShareToken(tokens.live).transaction((tx) => tx.form.update({ where: { id: ids.live }, data: { title: "Changed" } })),
    ).rejects.toThrow();
    await expect(forShareToken(tokens.live).transaction((tx) => tx.form.delete({ where: { id: ids.live } }))).rejects.toThrow();
    await expect(
      forShareToken(tokens.live).transaction((tx) =>
        tx.form.create({ data: { tenantId: a.id, kind: "QUESTIONNAIRE", title: "Smuggled", createdById: creator.id } }),
      ),
    ).rejects.toThrow(violation);
    await expect(
      forShareToken(tokens.live).transaction((tx) =>
        tx.formResponse.create({ data: { tenantId: a.id, formId: ids.live, status: "COMPLETED" } }),
      ),
    ).rejects.toThrow(violation);
    expect((await db.form.findUniqueOrThrow({ where: { id: ids.live } })).title).toBe("live");
  });

  test("the school context set from the row found reaches that school's questions and takes its answers", async () => {
    await forShareToken(tokens.live).transaction(async (tx) => {
      const found = await tx.form.findUniqueOrThrow({ where: { shareToken: tokens.live }, select: { id: true, tenantId: true } });
      await setTenantContext(tx, trustedTenantId(found.tenantId));
      const questions = await tx.formQuestion.findMany({ where: { formId: found.id } });
      expect(questions.map((q) => q.prompt)).toEqual(["Question of live"]);
      const response = await tx.formResponse.create({ data: { tenantId: found.tenantId, formId: found.id, status: "COMPLETED" } });
      expect(response.tenantId).toBe(a.id);
    });
    expect(await db.formResponse.count({ where: { formId: ids.live } })).toBe(1);
  });

  test("…and never another school's, whatever the row says", async () => {
    await expect(
      forShareToken(tokens.live).transaction(async (tx) => {
        await setTenantContext(tx, trustedTenantId(a.id));
        await tx.formResponse.create({ data: { tenantId: b.id, formId: ids.foreign, status: "COMPLETED" } });
      }),
    ).rejects.toThrow(violation);
    expect(await db.formResponse.count({ where: { formId: ids.foreign } })).toBe(0);
  });

  test("the share context is gone when the transaction ends, on every connection of the pool", async () => {
    await forShareToken(tokens.live).transaction((tx) => tx.form.findMany());
    const later = await Promise.all(Array.from({ length: 12 }, () => prisma.form.findMany()));
    for (const rows of later) expect(rows).toEqual([]);
  });
});
