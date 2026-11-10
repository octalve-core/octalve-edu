import "../support/env";
import { test, expect } from "@playwright/test";
import { SAAS_URL } from "../support/env";
import {
  Role,
  addMembership,
  createTenant,
  createUser,
  db,
  removeCreatedTenants,
  seedInstance,
  type TestTenant,
  type TestUser,
} from "../support/db";
import { api, cookieHeader, loginAs } from "../support/http";

// Streams (task 0035) over real HTTP: a class says which stream it is; a pupil stays in their stream when the class is rolled; when the stream cannot be worked out the roll asks, and
// refuses to guess; a placement can only go to a class of the next rung; everything is decided before the first write.

const SAAS = { baseUrl: SAAS_URL };
let a: TestTenant;
let b: TestTenant;
const people: Record<string, TestUser> = {};
const cookie: Record<string, string> = {};
const as = (who: string) => ({ ...SAAS, cookie: cookie[who] });
const school = (code = a.code) => `/api/v1/schools/${code}`;
const promo = (path: string) => `${school()}/academics/promotion/${path}`;
let counter = 0;
const uniq = (prefix: string) => `${prefix}${Date.now().toString(36)}${++counter}`;
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

type Stream = string | null;
type World = {
  s1: string;
  s2: string;
  periods: string[];
  subjects: string[];
  /// class key -> id, and "<class key>:<arm name>" -> arm id
  cls: Record<string, string>;
  arms: Record<string, string>;
};

/// A fresh calendar and a fresh ladder for school A. `ladder` is [key, rung, stream] in any order; every class gets arms A and B. Everything older is archived.
async function world(ladder: [string, number, Stream][]): Promise<World> {
  await db.classGroup.updateMany({ where: { tenantId: a.id, archivedAt: null }, data: { archivedAt: new Date() } });
  await db.academicSession.updateMany({ where: { tenantId: a.id, archivedAt: null }, data: { status: "CLOSED", archivedAt: new Date() } });
  const year = 2030 + (counter % 40);
  const session = (n: number, status: "ACTIVE" | "PLANNED") =>
    db.academicSession.create({
      data: { tenantId: a.id, label: uniq(`S${n}-`), startDate: day(`${year + n}-09-01`), endDate: day(`${year + n + 1}-07-31`), status },
    });
  const [s1, s2] = [await session(0, "ACTIVE"), await session(1, "PLANNED")];
  const periods: string[] = [];
  for (let n = 1; n <= 3; n++) {
    const p = await db.academicPeriod.create({
      data: {
        tenantId: a.id,
        sessionId: s1.id,
        kind: "TERM",
        ordinal: n,
        label: `Term ${n}`,
        startDate: day(`${year}-${String(8 + n).padStart(2, "0")}-02`),
        endDate: day(`${year}-${String(8 + n).padStart(2, "0")}-25`),
        isCurrent: n === 3,
      },
    });
    periods.push(p.id);
  }
  const cls: Record<string, string> = {};
  const arms: Record<string, string> = {};
  for (const [key, sortOrder, streamName] of ladder) {
    const g = await db.classGroup.create({ data: { tenantId: a.id, name: uniq(`${key}-`), sortOrder, streamName } });
    cls[key] = g.id;
    for (const name of ["A", "B"])
      arms[`${key}:${name}`] = (await db.classArm.create({ data: { tenantId: a.id, classGroupId: g.id, name } })).id;
  }
  const subjects = [(await db.subject.create({ data: { tenantId: a.id, name: uniq("Maths") } })).id];
  return { s1: s1.id, s2: s2.id, periods, subjects, cls, arms };
}

/// A pupil on the roll of an arm for the first session with this average in every term (null = no published result: the rule says repeat).
async function pupil(w: World, arm: string, average: number | null) {
  const record = await db.studentRecord.create({
    data: { tenantId: a.id, firstName: uniq("Pu"), lastName: "Stream", dateOfBirth: day("2014-03-03"), admissionNo: uniq("ST/") },
  });
  const enrolment = await db.studentEnrollment.create({
    data: { tenantId: a.id, studentId: record.id, sessionId: w.s1, classArmId: w.arms[arm] },
  });
  if (average !== null)
    for (const periodId of w.periods)
      for (const subjectId of w.subjects)
        await db.result.create({
          data: {
            tenantId: a.id,
            studentId: record.id,
            subjectId,
            periodId,
            score: average,
            maxScore: 100,
            status: "PUBLISHED",
            verificationToken: uniq("tok"),
          },
        });
  return { id: record.id, enrolment: enrolment.id };
}

const previewUrl = (w: World, cls: string) =>
  `${promo("preview")}?${new URLSearchParams({ sourceSessionId: w.s1, targetSessionId: w.s2, sourceClassGroupId: w.cls[cls] })}`;
const preview = async (w: World, cls: string) => (await api(previewUrl(w, cls), as("admin"))).json.data.preview;
const roll = (w: World, cls: string, extra: Record<string, unknown> = {}) =>
  api(promo("execute"), {
    ...as("admin"),
    method: "POST",
    body: { sourceSessionId: w.s1, targetSessionId: w.s2, sourceClassGroupId: w.cls[cls], ...extra },
  });
const placedIn = async (studentId: string, w: World) =>
  (await db.studentEnrollment.findFirst({ where: { studentId, sessionId: w.s2 }, include: { classArm: true } }))?.classArm ?? null;
const unchanged = async (w: World, pupils: { id: string; enrolment: string }[]) => {
  expect(await db.studentEnrollment.count({ where: { tenantId: a.id, sessionId: w.s2 } }), "nobody was placed").toBe(0);
  for (const p of pupils)
    expect((await db.studentEnrollment.findUnique({ where: { id: p.enrolment } }))!.status, "the roll is untouched").toBe("ACTIVE");
  expect(await db.promotionBatch.count({ where: { tenantId: a.id, sourceSessionId: w.s1 } }), "no batch").toBe(0);
};

test.beforeAll(async () => {
  await seedInstance();
  a = await createTenant({ name: "Streams School" });
  b = await createTenant({ name: "Other Streams School" });
  for (const who of ["admin", "adminB"]) people[who] = await createUser({ name: who });
  await addMembership(people.admin.id, a.id, Role.ADMIN);
  await addMembership(people.adminB.id, b.id, Role.ADMIN);
  for (const who of Object.keys(people)) cookie[who] = cookieHeader((await loginAs(people[who], SAAS)).token!);
});
test.afterAll(async () => {
  await removeCreatedTenants();
});

test.describe("a class says which stream it is", () => {
  const classes = () => `${school()}/academics/class-groups`;
  const create = (name: string, extra: Record<string, unknown> = {}) =>
    api(classes(), { ...as("admin"), method: "POST", body: { name, ...extra } });

  test("a stream is saved trimmed, a blank one means none, it is listed, and it can be changed and cleared", async () => {
    const made = await create(uniq("SS1 Sci "), { streamName: "  Science  " });
    expect(made.status, made.text).toBe(201);
    expect(made.json.data.classGroup.streamName).toBe("Science");
    const id = made.json.data.classGroup.id as string;
    expect((await db.classGroup.findUniqueOrThrow({ where: { id } })).streamName).toBe("Science");

    const none = await create(uniq("SS1 Plain "), { streamName: "   " });
    expect(none.status).toBe(201);
    expect(none.json.data.classGroup.streamName).toBeNull();
    expect((await create(uniq("SS1 Absent "))).json.data.classGroup.streamName).toBeNull();

    const listed = (await api(classes(), as("admin"))).json.data.classGroups as { id: string; streamName: string | null }[];
    expect(listed.find((g) => g.id === id)!.streamName).toBe("Science");

    const changed = await api(`${classes()}/${id}`, { ...as("admin"), method: "PATCH", body: { streamName: "Arts" } });
    expect(changed.status, changed.text).toBe(200);
    expect(changed.json.data).toMatchObject({ changed: true, classGroup: { streamName: "Arts" } });
    const same = await api(`${classes()}/${id}`, { ...as("admin"), method: "PATCH", body: { streamName: "Arts" } });
    expect(same.json.data.changed).toBe(false);
    const audit = await db.auditLog.findFirst({
      where: { tenantId: a.id, targetId: id, action: "CLASS_GROUP_UPDATED" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit!.beforeValue).toMatchObject({ streamName: "Science" });
    expect(audit!.afterValue).toMatchObject({ streamName: "Arts" });

    const cleared = await api(`${classes()}/${id}`, { ...as("admin"), method: "PATCH", body: { streamName: null } });
    expect(cleared.json.data.classGroup.streamName).toBeNull();
    const blank = await api(`${classes()}/${id}`, {
      ...as("admin"),
      method: "PATCH",
      body: { name: uniq("Renamed "), streamName: "Arts" },
    });
    expect(blank.json.data.classGroup.streamName).toBe("Arts");
    const blanked = await api(`${classes()}/${id}`, { ...as("admin"), method: "PATCH", body: { streamName: "  " } });
    expect(blanked.json.data.classGroup.streamName).toBeNull();
  });

  test("a stream longer than 40 characters, or not text, is refused with a sentence; an unknown field is refused", async () => {
    const long = await create(uniq("Long "), { streamName: "x".repeat(41) });
    expect(long.status).toBe(400);
    expect(long.json.error.message).toMatch(/40 characters/);
    expect((await create(uniq("Edge "), { streamName: "y".repeat(40) })).status).toBe(201);
    expect((await create(uniq("Num "), { streamName: 5 })).status).toBe(400);
    expect((await create(uniq("Odd "), { stream: "Science" })).status).toBe(400);
    const id = (await create(uniq("Patch "))).json.data.classGroup.id as string;
    const bad = await api(`${classes()}/${id}`, { ...as("admin"), method: "PATCH", body: { streamName: "z".repeat(41) } });
    expect(bad.status).toBe(400);
    expect((await api(`${classes()}/${id}`, { ...as("admin"), method: "PATCH", body: {} })).status).toBe(400);
  });

  test("the database refuses a stream that is blank, untrimmed or too long even if the application did not", async () => {
    for (const bad of ["", " Science", "Science ", "x".repeat(41)]) {
      await expect(
        db.classGroup.create({ data: { tenantId: a.id, name: uniq("Raw "), streamName: bad } }),
        JSON.stringify(bad),
      ).rejects.toThrow();
    }
  });
});

test.describe("the preview", () => {
  test("a class that is a stream goes to the class of its own stream; nothing to ask", async () => {
    const w = await world([
      ["sci1", 4, "Science"],
      ["arts1", 4, "Arts"],
      ["sci2", 5, "Science"],
      ["arts2", 5, "Arts"],
    ]);
    const mine = await pupil(w, "sci1:A", 70);
    const p = await preview(w, "sci1");
    expect(p.targetClassGroup.id).toBe(w.cls.sci2);
    expect(p.placementNeeded).toBe(false);
    expect(p.rungClasses.map((c: { id: string }) => c.id).sort()).toEqual([w.cls.sci2, w.cls.arts2].sort());
    expect(p.rungClasses.find((c: { id: string }) => c.id === w.cls.sci2)).toMatchObject({
      streamName: "Science",
      arms: [{ name: "A" }, { name: "B" }],
    });
    expect(p.students[0]).toMatchObject({
      studentId: mine.id,
      targetClassGroupId: w.cls.sci2,
      needsPlacement: false,
      targetClassArmName: "A",
    });
  });

  test("a class with no stream moving into streams needs a placement for each pupil who is to be promoted, not for one who repeats", async () => {
    const w = await world([
      ["jss3", 3, null],
      ["sci", 4, "Science"],
      ["arts", 4, "Arts"],
    ]);
    const up = await pupil(w, "jss3:A", 80);
    const stays = await pupil(w, "jss3:A", null);
    const p = await preview(w, "jss3");
    expect(p.placementNeeded).toBe(true);
    const row = (id: string) => p.students.find((s: { studentId: string }) => s.studentId === id);
    expect(row(up.id)).toMatchObject({ recommendedDecision: "PROMOTED", needsPlacement: true });
    expect(row(stays.id)).toMatchObject({ recommendedDecision: "REPEATED", needsPlacement: false, targetClassGroupId: w.cls.jss3 });
  });

  test("several classes and no stream at all: the first by name, nothing to ask (what the roll did before streams)", async () => {
    const w = await world([
      ["jss3", 3, null],
      ["ss1b", 4, null],
      ["ss1a", 4, null],
    ]);
    await pupil(w, "jss3:A", 80);
    const p = await preview(w, "jss3");
    expect(p.placementNeeded).toBe(false);
    expect(p.rungClasses).toHaveLength(2);
    expect(p.targetClassGroup.id).toBe(w.cls.ss1a); // "ss1a-…" sorts before "ss1b-…"
    const rolled = await roll(w, "jss3");
    expect(rolled.status, rolled.text).toBe(201);
  });

  test("two classes of the rung carrying the pupils' own stream do not pick one", async () => {
    const w = await world([
      ["sci1", 4, "Science"],
      ["sci2a", 5, "Science"],
      ["sci2b", 5, "Science"],
      ["arts2", 5, "Arts"],
    ]);
    await pupil(w, "sci1:A", 70);
    expect((await preview(w, "sci1")).placementNeeded).toBe(true);
  });
});

test.describe("rolling with streams", () => {
  test("a stream class rolls into its own stream's class, arm by name, and records the class", async () => {
    const w = await world([
      ["sci1", 4, "Science"],
      ["arts1", 4, "Arts"],
      ["sci2", 5, "Science"],
      ["arts2", 5, "Arts"],
    ]);
    const x = await pupil(w, "sci1:B", 75);
    const rolled = await roll(w, "sci1");
    expect(rolled.status, rolled.text).toBe(201);
    expect(await placedIn(x.id, w)).toMatchObject({ classGroupId: w.cls.sci2, name: "B" });
    const record = await db.promotionRecord.findFirstOrThrow({ where: { studentId: x.id } });
    expect(record.targetClassGroupId).toBe(w.cls.sci2);
    expect((await db.promotionBatch.findUniqueOrThrow({ where: { id: rolled.json.data.batch.id } })).targetClassGroupId).toBe(w.cls.sci2);
  });

  test("the roll refuses to guess: nobody is placed, nothing is recorded, and the sentence names the pupils", async () => {
    const w = await world([
      ["jss3", 3, null],
      ["sci", 4, "Science"],
      ["arts", 4, "Arts"],
    ]);
    const ps = [
      await pupil(w, "jss3:A", 80),
      await pupil(w, "jss3:A", 80),
      await pupil(w, "jss3:B", 80),
      await pupil(w, "jss3:B", 80),
      await pupil(w, "jss3:A", 80),
    ];
    const refused = await roll(w, "jss3");
    expect(refused.status).toBe(409);
    expect(refused.json.error.message).toMatch(
      /moves up into more than one class and is not a stream of any of them\. Choose the class for .+ and 2 more\./,
    );
    await unchanged(w, ps);
    // One pupil short of complete is still refused, naming that one pupil.
    const partial = await roll(w, "jss3", { placements: ps.slice(1).map((p) => ({ studentId: p.id, classGroupId: w.cls.sci })) });
    expect(partial.status).toBe(409);
    expect(partial.json.error.message).toMatch(/Choose the class for Pu\w+ Stream\./);
    await unchanged(w, ps);
  });

  test("with a class chosen for everyone the pupils are split between the streams, the arm follows the pupil's own arm name, and every class is recorded", async () => {
    const w = await world([
      ["jss3", 3, null],
      ["sci", 4, "Science"],
      ["arts", 4, "Arts"],
    ]);
    const toSci = await pupil(w, "jss3:A", 80);
    const toArts = await pupil(w, "jss3:B", 90);
    const repeats = await pupil(w, "jss3:A", null);
    const rolled = await roll(w, "jss3", {
      placements: [
        { studentId: toSci.id, classGroupId: w.cls.sci },
        { studentId: toArts.id, classGroupId: w.cls.arts },
      ],
    });
    expect(rolled.status, rolled.text).toBe(201);
    expect(rolled.json.data.batch.totals).toMatchObject({ promoted: 2, repeated: 1 });
    expect(await placedIn(toSci.id, w)).toMatchObject({ classGroupId: w.cls.sci, name: "A" });
    expect(await placedIn(toArts.id, w)).toMatchObject({ classGroupId: w.cls.arts, name: "B" });
    expect(await placedIn(repeats.id, w)).toMatchObject({ classGroupId: w.cls.jss3, name: "A" }); // repeats stay in their own class
    const records = await db.promotionRecord.findMany({ where: { tenantId: a.id, batchId: rolled.json.data.batch.id } });
    const byPupil = Object.fromEntries(records.map((r) => [r.studentId, r.targetClassGroupId]));
    expect(byPupil).toEqual({ [toSci.id]: w.cls.sci, [toArts.id]: w.cls.arts, [repeats.id]: w.cls.jss3 });
    const audit = await db.auditLog.findFirstOrThrow({
      where: { tenantId: a.id, action: "PROMOTION_EXECUTED", targetId: rolled.json.data.batch.id },
    });
    expect(audit.afterValue).toMatchObject({ placements: 2 });
  });

  test("a placement is allowed where nothing forces it (a school may split a plain rung), and an arm chosen by hand must belong to the placed class", async () => {
    const w = await world([
      ["jss3", 3, null],
      ["ss1a", 4, null],
      ["ss1b", 4, null],
    ]);
    const p = await pupil(w, "jss3:A", 80);
    const q = await pupil(w, "jss3:A", 80);
    const wrongArm = await roll(w, "jss3", {
      placements: [{ studentId: p.id, classGroupId: w.cls.ss1b }],
      overrides: [{ studentId: p.id, decision: "PROMOTED", targetClassArmId: w.arms["ss1a:B"], overrideReason: "asked for" }],
    });
    expect(wrongArm.status).toBe(400);
    expect(wrongArm.json.error.message).toMatch(/not an active arm of/);
    await unchanged(w, [p, q]);
    const ok = await roll(w, "jss3", {
      placements: [{ studentId: p.id, classGroupId: w.cls.ss1b }],
      overrides: [{ studentId: p.id, decision: "PROMOTED", targetClassArmId: w.arms["ss1b:B"], overrideReason: "asked for" }],
    });
    expect(ok.status, ok.text).toBe(201);
    expect(await placedIn(p.id, w)).toMatchObject({ classGroupId: w.cls.ss1b, name: "B" });
    expect((await placedIn(q.id, w))!.classGroupId).toBe(w.cls.ss1a); // nobody placed q: the default, the first by name
  });
});

test.describe("what a placement may not do", () => {
  const setup = async () => {
    const w = await world([
      ["jss2", 2, null],
      ["jss3", 3, null],
      ["sci", 4, "Science"],
      ["arts", 4, "Arts"],
      ["sci5", 5, "Science"],
    ]);
    const up = await pupil(w, "jss3:A", 80);
    const repeats = await pupil(w, "jss3:A", null);
    return { w, up, repeats };
  };

  test("only a class of the next rung: not the same rung as the source, not a class two rungs up, not an archived class, not another school's class", async () => {
    const { w, up, repeats } = await setup();
    const other = await db.classGroup.create({ data: { tenantId: b.id, name: uniq("Foreign "), sortOrder: 4 } });
    const archived = await db.classGroup.create({
      data: { tenantId: a.id, name: uniq("Gone "), sortOrder: 4, streamName: "Gone", archivedAt: new Date() },
    });
    for (const [what, classGroupId] of [
      ["the class itself", w.cls.jss3],
      ["a lower class", w.cls.jss2],
      ["two rungs up", w.cls.sci5],
      ["an archived class", archived.id],
      ["another school's class", other.id],
      ["an id that does not exist", "cl_not_a_real_class_id_0000000"],
    ] as const) {
      const res = await roll(w, "jss3", { placements: [{ studentId: up.id, classGroupId }] });
      expect(res.status, `${what}: ${res.text}`).toBe(409);
      expect(res.json.error.message, what).toMatch(/does not move up into the class chosen for Pu\w+ Stream\. Choose one of /);
    }
    await unchanged(w, [up, repeats]);
  });

  test("only a pupil who is to be promoted: not one who repeats, not one who is not on the roll, not one who already has a place; each pupil once", async () => {
    const { w, up, repeats } = await setup();
    const sciOnly = { classGroupId: w.cls.sci };
    const r1 = await roll(w, "jss3", {
      placements: [
        { studentId: repeats.id, ...sciOnly },
        { studentId: up.id, ...sciOnly },
      ],
    });
    expect(r1.status).toBe(409);
    expect(r1.json.error.message).toMatch(/is not being promoted, so there is no next class to choose for them\./);
    const stranger = await db.studentRecord.create({
      data: { tenantId: a.id, firstName: uniq("St"), lastName: "Elsewhere", dateOfBirth: day("2013-01-01"), admissionNo: uniq("EL/") },
    });
    const r2 = await roll(w, "jss3", {
      placements: [
        { studentId: stranger.id, ...sciOnly },
        { studentId: up.id, ...sciOnly },
      ],
    });
    expect(r2.status).toBe(409);
    expect(r2.json.error.message).toMatch(/not in this class for the source session/);
    const r3 = await roll(w, "jss3", {
      placements: [
        { studentId: up.id, ...sciOnly },
        { studentId: up.id, classGroupId: w.cls.arts },
      ],
    });
    expect(r3.status).toBe(400);
    expect(JSON.stringify(r3.json.error)).toMatch(/placed twice/);
    // A pupil who already has a place in the next session cannot be placed again.
    await db.studentEnrollment.create({ data: { tenantId: a.id, studentId: up.id, sessionId: w.s2, classArmId: w.arms["arts:A"] } });
    const r4 = await roll(w, "jss3", { placements: [{ studentId: up.id, ...sciOnly }] });
    expect(r4.status).toBe(409);
    expect(r4.json.error.message).toMatch(/already has a place in the next session/);
    expect((await db.studentEnrollment.findUnique({ where: { id: repeats.enrolment } }))!.status).toBe("ACTIVE");
    expect(await db.promotionBatch.count({ where: { tenantId: a.id, sourceSessionId: w.s1 } })).toBe(0);
  });

  test("a pupil whose decision an override changes to repeat is not promoted, so a placement for them is refused; an override to promote makes a placement needed", async () => {
    const { w, up, repeats } = await setup();
    const asRepeat = await roll(w, "jss3", {
      placements: [{ studentId: up.id, classGroupId: w.cls.sci }],
      overrides: [{ studentId: up.id, decision: "REPEATED", overrideReason: "illness" }],
    });
    expect(asRepeat.status).toBe(409);
    expect(asRepeat.json.error.message).toMatch(/is not being promoted/);
    const promoteTheWeak = await roll(w, "jss3", {
      placements: [{ studentId: up.id, classGroupId: w.cls.sci }],
      overrides: [{ studentId: repeats.id, decision: "PROMOTED", overrideReason: "moved with friends" }],
    });
    expect(promoteTheWeak.status).toBe(409);
    expect(promoteTheWeak.json.error.message).toMatch(/Choose the class for Pu\w+ Stream\./);
    const both = await roll(w, "jss3", {
      placements: [
        { studentId: up.id, classGroupId: w.cls.sci },
        { studentId: repeats.id, classGroupId: w.cls.arts },
      ],
      overrides: [{ studentId: repeats.id, decision: "PROMOTED", overrideReason: "moved with friends" }],
    });
    expect(both.status, both.text).toBe(201);
    expect((await placedIn(repeats.id, w))!.classGroupId).toBe(w.cls.arts);
  });

  test("a class on the rung with no arm cannot be placed into: refused before anything is written", async () => {
    const { w, up, repeats } = await setup();
    await db.classArm.updateMany({ where: { classGroupId: w.cls.arts }, data: { archivedAt: new Date() } });
    const res = await roll(w, "jss3", { placements: [{ studentId: up.id, classGroupId: w.cls.arts }] });
    expect(res.status).toBe(409);
    expect(res.json.error.message).toMatch(/has no arm yet, so nobody can be promoted into it/);
    await unchanged(w, [up, repeats]);
  });

  test("a placement from someone who may not roll is refused like the roll itself", async () => {
    const { w, up } = await setup();
    const res = await api(promo("execute"), {
      ...as("adminB"),
      method: "POST",
      body: {
        sourceSessionId: w.s1,
        targetSessionId: w.s2,
        sourceClassGroupId: w.cls.jss3,
        placements: [{ studentId: up.id, classGroupId: w.cls.sci }],
      },
    });
    expect(res.status).toBe(403);
    expect(await db.studentEnrollment.count({ where: { tenantId: a.id, sessionId: w.s2 } })).toBe(0);
  });
});
