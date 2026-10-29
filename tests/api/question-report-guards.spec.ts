import "../support/env";
import { test, expect } from "@playwright/test";
import { SAAS_URL } from "../support/env";
import { Role, createTenant, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { api as rawApi } from "../support/http";
import { approvedItem, member, pupil, type Person, type Pupil } from "../support/qbank-world";

// Reports on questions: who sees the queue, what a pupil's report tells the reviewer, one open report each, and one resolution each.
//
//   - The queue is the reviewers': a report is read by the people who may review its question (the same rule as resolving it and as the queue of pending questions).
//   - A pupil's report shows the reviewer a role and a campus and nothing else; the campus is shown only once enough different pupils of it have reported the question (the threshold of
//     the small-summary switch, as for an anonymous questionnaire).
//   - A person has one open report on a question; two at the same moment are one.
//   - A report is resolved once, however many reviewers press the button at the same moment.
//
// The two races are tried several times over: they are a matter of timing, and one clean round proves nothing. (The same rules as AlEemaan's question-report-guards spec. Octalve names
// a pupil's campus where AlEemaan names the section of the class, and keeps no version on a report, so those two checks of that spec have no counterpart here.)

const SAAS = { baseUrl: SAAS_URL };
const api: typeof rawApi = (path, opts = {}) => rawApi(path, { ...SAAS, ...opts });
const ROUNDS = 4;
const AT_ONCE = 6;
const MINIMUM = 5; // bank.smallSummary.min by default

let t: TestTenant;
let north: string;
let south: string;
let admin: Person;
let teacher: Person;
let reviewer: Person;
let mathsReviewer: Person;
let northAdmin: Person;
let southAdmin: Person;
let clerk: Person;
let civics: { id: string };
let maths: { id: string };
let wide: { id: string }; // a school-wide question: only the school's administrator reviews it here
let pupilCount = 0;

test.beforeAll(async () => {
  await seedInstance();
  t = await createTenant({ name: "Report Guards School", campuses: ["North", "South"] });
  north = t.campuses[0].id;
  south = t.campuses[1].id;
  admin = await member(t, Role.ADMIN, null, "School Admin");
  teacher = await member(t, Role.TEACHING_STAFF, north, "Tariq Teacher");
  reviewer = await member(t, Role.TEACHING_STAFF, north, "Rashid Reviewer");
  mathsReviewer = await member(t, Role.TEACHING_STAFF, north, "Maryam Maths");
  northAdmin = await member(t, Role.CAMPUS_ADMIN, north, "North Admin");
  southAdmin = await member(t, Role.CAMPUS_ADMIN, south, "South Admin");
  clerk = await member(t, Role.NON_TEACHING_STAFF, north, "Chidi Clerk");
  await db.questionBankReviewer.create({
    data: { tenantId: t.id, userId: reviewer.user.id, assignedById: admin.user.id, scope: "GENERAL", campusId: north } as never,
  });
  await db.questionBankReviewer.create({
    data: {
      tenantId: t.id,
      userId: mathsReviewer.user.id,
      assignedById: admin.user.id,
      scope: "SUBJECT",
      subjectLabel: "Mathematics",
      subjectKey: "mathematics",
      campusId: north,
    } as never,
  });
  civics = await approvedItem(t.id, north, teacher.user.id, {
    prompt: "What is the capital of Nigeria?",
    subjectLabel: "Civics",
    subjectKey: "civics",
  });
  maths = await approvedItem(t.id, north, teacher.user.id, { prompt: "What is 7 times 8?" });
  wide = await approvedItem(t.id, null, admin.user.id, {
    prompt: "What is the largest ocean?",
    subjectLabel: "Geography",
    subjectKey: "geography",
  });
});
test.afterAll(async () => {
  await removeCreatedTenants();
});

/** A pupil of the given campus who has practised the given questions. */
async function makePupil(campusId: string, practised: string[]): Promise<Pupil> {
  pupilCount += 1;
  const p = await pupil(t, campusId, null, `Pupil${pupilCount}`);
  for (const bankItemId of practised) {
    const session = await db.practiceSession.create({
      data: { tenantId: t.id, campusId, studentId: p.student.id, subjectLabel: "Any", subjectKey: "any", size: 1, itemIds: [bankItemId] },
    });
    await db.practiceAttempt.create({
      data: { tenantId: t.id, sessionId: session.id, studentId: p.student.id, bankItemId, version: 1, answer: "b", correct: false },
    });
  }
  return p;
}

const base = () => `/api/v1/schools/${t.code}`;
const pupilReports = (p: Pupil, bankItemId: string, reason = "The second option looks wrong to me.") =>
  api(`${base()}/portal/practice/reports`, { method: "POST", cookie: p.cookie, body: { bankItemId, reason } });
const teacherReports = (who: Person, itemId: string, reason = "The explanation is unclear to me.") =>
  api(`${base()}/question-bank/items/${itemId}/report`, { method: "POST", cookie: who.cookie, body: { reason } });
const queue = (who: Person, qs = "status=ALL") => api(`${base()}/question-bank/reports?${qs}`, { cookie: who.cookie });
const resolve = (who: Person, reportId: string) =>
  api(`${base()}/question-bank/reports/${reportId}`, {
    method: "PATCH",
    cookie: who.cookie,
    body: { outcome: "NOT_AN_ERROR", outcomeReason: "The question is right as it is." },
  });
const labelsFor = async (who: Person, itemId: string): Promise<string[]> => {
  const res = await queue(who, `itemId=${itemId}&status=ALL`);
  expect(res.status, res.text.slice(0, 160)).toBe(200);
  return (res.json.data.reports as { reporter: string }[]).map((r) => r.reporter).sort();
};
const clear = () => db.questionReport.deleteMany({ where: { tenantId: t.id } });

test.beforeEach(async () => {
  await clear();
});

test.describe("who sees the queue", () => {
  test("only the people who may review a question see its reports; everyone else gets an empty list", async () => {
    const p = await makePupil(north, [civics.id]);
    expect((await pupilReports(p, civics.id)).status).toBe(201);
    expect((await teacherReports(teacher, maths.id)).status).toBe(201);

    const seen = async (who: Person, qs?: string) => {
      const res = await queue(who, qs);
      expect(res.status, res.text.slice(0, 160)).toBe(200);
      return (res.json.data.reports as { itemId: string }[]).map((r) => r.itemId).sort();
    };
    const both = [civics.id, maths.id].sort();

    expect(await seen(admin), "the school's administrator").toEqual(both);
    expect(await seen(reviewer), "a reviewer for every subject of the campus").toEqual(both);
    expect(await seen(northAdmin), "the administrator of the campus").toEqual(both);
    expect(await seen(mathsReviewer), "a reviewer for mathematics sees mathematics only").toEqual([maths.id]);

    expect(await seen(teacher), "a teacher who is not a reviewer, even of a question they wrote").toEqual([]);
    expect(await seen(clerk), "non-teaching staff").toEqual([]);
    expect(await seen(teacher, `itemId=${civics.id}&status=ALL`), "asking for the question by its id changes nothing").toEqual([]);
    expect(await seen(southAdmin), "the administrator of another campus").toEqual([]);
  });
});

test.describe("what a pupil's report tells the reviewer", () => {
  test("the campus is shown only once enough different pupils of it have reported the question", async () => {
    const pupils: Pupil[] = [];
    for (let i = 0; i < MINIMUM; i++) pupils.push(await makePupil(north, [civics.id]));

    for (let i = 0; i < MINIMUM - 1; i++) {
      expect((await pupilReports(pupils[i]!, civics.id)).status).toBe(201);
      expect(await labelsFor(admin, civics.id), `${i + 1} pupil(s) have reported: no campus`).toEqual(Array(i + 1).fill("Pupil"));
    }
    expect((await pupilReports(pupils[MINIMUM - 1]!, civics.id)).status).toBe(201);
    expect(await labelsFor(admin, civics.id), `${MINIMUM} pupils have reported: the campus may be named`).toEqual(
      Array(MINIMUM).fill("Pupil in North"),
    );
  });

  test("pupils of another campus, and a pupil reporting twice, do not make up the number", async () => {
    // a school-wide question: each pupil's report carries the pupil's own campus
    const northern = [] as Pupil[];
    for (let i = 0; i < MINIMUM - 1; i++) northern.push(await makePupil(north, [wide.id]));
    const southerner = await makePupil(south, [wide.id]);

    for (const p of northern) expect((await pupilReports(p, wide.id)).status).toBe(201);
    expect((await pupilReports(southerner, wide.id)).status).toBe(201);
    expect(await labelsFor(admin, wide.id), "four of one campus and one of another: neither is enough").toEqual(
      Array(MINIMUM).fill("Pupil"),
    );

    // The first pupil's report is resolved, and they report again: five reports of the campus, four pupils.
    const first = await db.questionReport.findFirstOrThrow({ where: { reporterStudentId: northern[0]!.student.id, bankItemId: wide.id } });
    expect((await resolve(admin, first.id)).status).toBe(200);
    expect((await pupilReports(northern[0]!, wide.id)).status).toBe(201);
    expect(await labelsFor(admin, wide.id), "five reports of the campus from four pupils: still not enough").toEqual(
      Array(MINIMUM + 1).fill("Pupil"),
    );
  });

  test("a teacher's report is named by role and campus whatever the number of reports", async () => {
    expect((await teacherReports(teacher, maths.id)).status).toBe(201);
    expect(await labelsFor(admin, maths.id)).toEqual(["Teacher in North"]);
  });
});

test.describe("one open report each", () => {
  test("a pupil's second report of a question while the first is open is refused, and is allowed once the first is resolved", async () => {
    const p = await makePupil(north, [civics.id, maths.id]);
    const other = await makePupil(north, [civics.id]);

    const first = await pupilReports(p, civics.id);
    expect(first.status).toBe(201);
    const second = await pupilReports(p, civics.id, "I am saying it again, with other words.");
    expect(second.status).toBe(400);
    expect(second.json.error.code).toBe("ALREADY_REPORTED");
    expect(await db.questionReport.count({ where: { reporterStudentId: p.student.id, bankItemId: civics.id } }), "one row, not two").toBe(
      1,
    );

    expect((await pupilReports(p, maths.id)).status, "another question").toBe(201);
    expect((await pupilReports(other, civics.id)).status, "another pupil, the same question").toBe(201);

    expect((await resolve(admin, first.json.data.reportId)).status).toBe(200);
    expect((await pupilReports(p, civics.id)).status, "once the first is resolved").toBe(201);
  });

  test("a teacher's second report of a question while the first is open is refused", async () => {
    expect((await teacherReports(teacher, maths.id)).status).toBe(201);
    const second = await teacherReports(teacher, maths.id, "Saying it again with other words.");
    expect(second.status).toBe(400);
    expect(second.json.error.code).toBe("ALREADY_REPORTED");
    expect((await teacherReports(teacher, civics.id)).status, "another question").toBe(201);
    expect(await db.questionReport.count({ where: { reporterUserId: teacher.user.id, bankItemId: maths.id } })).toBe(1);
  });

  test("reports made at the same moment are one report", async () => {
    const p = await makePupil(north, [civics.id]);
    for (let round = 0; round < ROUNDS; round++) {
      await db.questionReport.deleteMany({ where: { reporterStudentId: p.student.id } });
      const results = await Promise.all(Array.from({ length: AT_ONCE }, () => pupilReports(p, civics.id)));
      expect(results.map((r) => r.status).sort(), `round ${round}: one 201, the rest 400`).toEqual([201, ...Array(AT_ONCE - 1).fill(400)]);
      expect(
        await db.questionReport.count({ where: { reporterStudentId: p.student.id, bankItemId: civics.id } }),
        `round ${round}: one row`,
      ).toBe(1);
    }
  });
});

test.describe("resolving a report", () => {
  test("a report is resolved once, however many reviewers press the button at the same moment", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      await clear();
      const filed = await teacherReports(teacher, maths.id, `Round ${round}: the wording is unclear.`);
      expect(filed.status).toBe(201);
      const reportId = filed.json.data.reportId as string;

      const results = await Promise.all(Array.from({ length: AT_ONCE }, () => resolve(reviewer, reportId)));
      expect(results.map((r) => r.status).sort(), `round ${round}: one 200, the rest 400`).toEqual([200, ...Array(AT_ONCE - 1).fill(400)]);
      expect(
        await db.questionBankAudit.count({ where: { ref: reportId, action: "REPORT_RESOLVED" } }),
        `round ${round}: one audit row`,
      ).toBe(1);
    }
  });
});

// A person's reports are limited, so that one account cannot bury the queue: a pupil may have 10 reports waiting for a reviewer and 20 a day, a teacher 20 waiting and 50 a day. The day is
// the UTC day, as for the daily practice cap.
const newItem = (prompt: string) => approvedItem(t.id, north, teacher.user.id, { prompt, subjectLabel: "Civics", subjectKey: "civics" });

test.describe("how many reports one person may make", () => {
  test("a pupil may have 10 reports waiting; another is refused until a reviewer has answered one", async () => {
    const items = [];
    for (let i = 0; i < 11; i++) items.push(await newItem(`Pupil limit question ${i}`));
    const p = await makePupil(
      north,
      items.map((x) => x.id),
    );
    const q = await makePupil(north, [items[10]!.id]);

    for (let i = 0; i < 10; i++) expect((await pupilReports(p, items[i]!.id)).status, `report ${i + 1}`).toBe(201);
    const over = await pupilReports(p, items[10]!.id);
    expect(over.status, over.text.slice(0, 160)).toBe(429);
    expect(over.json.error.code).toBe("REPORT_LIMIT");
    expect(await db.questionReport.count({ where: { reporterStudentId: p.student.id } }), "nothing was written for the eleventh").toBe(10);
    expect((await pupilReports(q, items[10]!.id)).status, "another pupil is not held back by this one's limit").toBe(201);

    const first = await db.questionReport.findFirstOrThrow({ where: { reporterStudentId: p.student.id } });
    expect((await resolve(admin, first.id)).status).toBe(200);
    expect((await pupilReports(p, items[10]!.id)).status, "a slot is free once a reviewer has answered one").toBe(201);
  });

  test("a teacher may have 20 reports waiting; another is refused", async () => {
    const items = [];
    for (let i = 0; i < 21; i++) items.push(await newItem(`Teacher limit question ${i}`));
    for (let i = 0; i < 20; i++) expect((await teacherReports(teacher, items[i]!.id)).status, `report ${i + 1}`).toBe(201);
    const over = await teacherReports(teacher, items[20]!.id);
    expect(over.status, over.text.slice(0, 160)).toBe(429);
    expect(over.json.error.code).toBe("REPORT_LIMIT");
    expect(await db.questionReport.count({ where: { reporterUserId: teacher.user.id } })).toBe(20);
  });

  test("a pupil may make 20 reports a day even when each is answered at once; yesterday's do not count", async () => {
    const item = await newItem("Daily limit question");
    const p = await makePupil(north, [item.id]);
    for (let i = 0; i < 20; i++) {
      expect((await pupilReports(p, item.id, `Report number ${i + 1} on this question.`)).status, `report ${i + 1}`).toBe(201);
      await db.questionReport.updateMany({
        where: { reporterStudentId: p.student.id, status: "OPEN" },
        data: { status: "RESOLVED", resolvedAt: new Date() },
      });
    }
    const over = await pupilReports(p, item.id, "One more, the twenty-first today.");
    expect(over.status, over.text.slice(0, 160)).toBe(429);
    expect(over.json.error.code).toBe("REPORT_LIMIT");

    await db.questionReport.updateMany({
      where: { reporterStudentId: p.student.id },
      data: { createdAt: new Date(Date.now() - 2 * 86_400_000) },
    });
    expect((await pupilReports(p, item.id, "A new day, a new report.")).status).toBe(201);
  });

  test("reports made at the same moment by one person cannot go over the limit", async () => {
    const items = [];
    for (let i = 0; i < 14; i++) items.push(await newItem(`Race limit question ${i}`));
    const p = await makePupil(
      north,
      items.map((x) => x.id),
    );
    for (let round = 0; round < 3; round++) {
      await db.questionReport.deleteMany({ where: { reporterStudentId: p.student.id } });
      const results = await Promise.all(items.map((x) => pupilReports(p, x.id)));
      expect(
        results.filter((r) => r.status === 201),
        `round ${round}: ten get in`,
      ).toHaveLength(10);
      expect(
        results.filter((r) => r.status === 429),
        `round ${round}: the rest are over the limit`,
      ).toHaveLength(4);
      expect(await db.questionReport.count({ where: { reporterStudentId: p.student.id } }), `round ${round}: ten rows`).toBe(10);
    }
  });
});
