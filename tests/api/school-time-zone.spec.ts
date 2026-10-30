import "../support/env";
import { test, expect } from "@playwright/test";
import { SAAS_URL } from "../support/env";
import { Role, createTenant, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { api as rawApi } from "../support/http";
import { approvedItem, member, pupil, setBank, type Person, type Pupil } from "../support/qbank-world";
import { startOfSchoolDay } from "@/lib/school-settings/school-day";

// A school's day is its own. The practice cap (questions a pupil may take in a day) and the reports one person may make in a day used to count the UTC day for every school,
// so a school in Lagos had its allowance renewed at 01:00. Each school now has a time zone setting (SchoolSettings.timeZone, "UTC" until chosen); the day starts at midnight there.
// Changing it is a settings change like the others: an administrator, a step-up proof, an audit row.
//
// The limits are tested with two schools, one left on UTC and one in Pacific/Kiritimati (UTC+14, whose day starts at 10:00 UTC, as far from the UTC day as a school can be), and
// with work done at a moment that lies between the two days' starts: after one's start, before the other's. The same moment is then in "today" for one school and not for the other.

const SAAS = { baseUrl: SAAS_URL };
const api: typeof rawApi = (path, opts = {}) => rawApi(path, { ...SAAS, ...opts });
const FAR = "Pacific/Kiritimati";
const CAP = 10;

type School = { tenant: TestTenant; admin: Person; teacher: Person; pupil: Pupil; item: { id: string } };
const schools: School[] = [];
let utc: School;
let far: School;
let outsider: Person; // an administrator of a third school

async function makeSchool(name: string): Promise<School> {
  const tenant = await createTenant({ name, campuses: ["North"] });
  const admin = await member(tenant, Role.ADMIN, null, `${name} Admin`);
  const teacher = await member(tenant, Role.TEACHING_STAFF, tenant.campuses[0]!.id, `${name} Teacher`);
  const p = await pupil(tenant, tenant.campuses[0]!.id, null, `${name} Pupil`);
  const item = await approvedItem(tenant.id, null, admin.user.id);
  await setBank(tenant.id, admin.user.id, "bank.practice.dailyCap", CAP);
  const made = { tenant, admin, teacher, pupil: p, item };
  schools.push(made);
  return made;
}

const settingsPath = (s: School) => `/api/v1/schools/${s.tenant.code}/settings`;
const patch = (who: Person, s: School, changes: unknown, password = who.user.password) =>
  api(settingsPath(s), { method: "PATCH", cookie: who.cookie, body: { changes, stepUp: { type: "password", value: password } } });
const storedZone = async (s: School) => (await db.schoolSettings.findUniqueOrThrow({ where: { tenantId: s.tenant.id } })).timeZone;
const audits = (s: School) =>
  db.settingsChangeAudit.findMany({ where: { tenantId: s.tenant.id, field: "timeZone" }, orderBy: { createdAt: "asc" } });

test.beforeAll(async () => {
  await seedInstance();
  utc = await makeSchool("Greenwich Academy");
  far = await makeSchool("Kiritimati Academy");
  await db.schoolSettings.update({ where: { tenantId: far.tenant.id }, data: { timeZone: FAR } });
  const third = await createTenant({ name: "Third School" });
  outsider = await member(third, Role.ADMIN, null, "Third Admin");
});
test.afterAll(async () => {
  await removeCreatedTenants();
});

test.describe("choosing the school's time zone", () => {
  test.describe.configure({ mode: "serial" });

  test("a school starts on UTC", async () => {
    const res = await api(settingsPath(utc), { cookie: utc.admin.cookie });
    expect(res.status).toBe(200);
    expect(res.json.data.settings.timeZone).toBe("UTC");
  });

  test("an administrator changes it with a step-up proof, and the change is audited with who, from and to", async () => {
    const res = await patch(utc.admin, utc, { timeZone: "Africa/Lagos" });
    expect(res.status, res.text.slice(0, 200)).toBe(200);
    expect(res.json.data.settings.timeZone).toBe("Africa/Lagos");
    expect(res.json.data.deltas).toEqual([{ field: "timeZone", fromValue: "UTC", toValue: "Africa/Lagos", isWeakeningSecurity: false }]);
    expect(await storedZone(utc)).toBe("Africa/Lagos");
    const rows = await audits(utc);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorUserId: utc.admin.user.id, fromValue: "UTC", toValue: "Africa/Lagos" });
    expect(rows[0]!.stepUpVerifiedAt).toBeInstanceOf(Date);
  });

  test("saving the same value again writes nothing", async () => {
    const res = await patch(utc.admin, utc, { timeZone: "Africa/Lagos" });
    expect(res.status).toBe(200);
    expect(res.json.data.deltas).toEqual([]);
    expect(await audits(utc)).toHaveLength(1);
  });

  test("a name that is not a time zone is refused, and nothing is stored or audited", async () => {
    for (const bad of ["Mars/Olympus_Mons", "", " ", " Africa/Lagos", "+01:00", "Lagos time", "x".repeat(65), 5, null, true, ["UTC"]]) {
      const res = await patch(utc.admin, utc, { timeZone: bad });
      expect(res.status, JSON.stringify(bad)).toBe(400);
    }
    expect(await storedZone(utc)).toBe("Africa/Lagos");
    expect(await audits(utc)).toHaveLength(1);
  });

  test("a wrong password changes nothing", async () => {
    const res = await patch(utc.admin, utc, { timeZone: "Asia/Kolkata" }, "not-the-password");
    expect(res.status).toBe(403);
    expect(await storedZone(utc)).toBe("Africa/Lagos");
  });

  test("only an administrator of the school may change it", async () => {
    expect((await patch(utc.teacher, utc, { timeZone: "Asia/Kolkata" })).status).toBe(403);
    expect((await patch(outsider, utc, { timeZone: "Asia/Kolkata" })).status).toBe(403);
    expect((await api(settingsPath(utc), { method: "PATCH", body: { changes: { timeZone: "Asia/Kolkata" } } })).status).toBe(401);
    expect(await storedZone(utc)).toBe("Africa/Lagos");
  });

  test("one school's time zone is its own: the other is where it was", async () => {
    expect(await storedZone(far)).toBe(FAR);
    const back = await patch(utc.admin, utc, { timeZone: "UTC" });
    expect(back.status).toBe(200);
    expect(await storedZone(utc)).toBe("UTC");
    expect(await storedZone(far)).toBe(FAR);
  });
});

test.describe("the school's day reaches the daily limits", () => {
  const PRACTICE = (s: School) => `/api/v1/schools/${s.tenant.code}/portal/practice`;

  /// A moment that lies between the two days' starts: after one of them, before the other. Whichever way round they fall at this hour, it is in today for one school and not the other.
  const between = () => {
    const now = new Date();
    const utcStart = startOfSchoolDay(now, "UTC");
    const farStart = startOfSchoolDay(now, FAR);
    expect(utcStart.getTime(), "the two schools' days start at different moments").not.toBe(farStart.getTime());
    const moment = new Date((utcStart.getTime() + farStart.getTime()) / 2);
    return { moment, inUtcDay: moment >= utcStart, inFarDay: moment >= farStart };
  };

  test.beforeEach(async () => {
    for (const s of schools) {
      await db.practiceAttempt.deleteMany({ where: { tenantId: s.tenant.id } });
      await db.practiceSession.deleteMany({ where: { tenantId: s.tenant.id } });
      await db.questionReport.deleteMany({ where: { tenantId: s.tenant.id } });
    }
    await db.schoolSettings.update({ where: { tenantId: utc.tenant.id }, data: { timeZone: "UTC" } });
    await db.schoolSettings.update({ where: { tenantId: far.tenant.id }, data: { timeZone: FAR } });
  });

  /// `count` answers by the school's pupil at `at`, in a finished set.
  async function answeredAt(s: School, at: Date, count: number) {
    const session = await db.practiceSession.create({
      data: {
        tenantId: s.tenant.id,
        campusId: s.pupil.student.campusId,
        studentId: s.pupil.student.id,
        subjectLabel: "Mathematics",
        subjectKey: "mathematics",
        size: count,
        itemIds: [s.item.id],
        startedAt: at,
        finishedAt: at,
      },
    });
    for (let i = 0; i < count; i++) {
      await db.practiceAttempt.create({
        data: {
          tenantId: s.tenant.id,
          sessionId: session.id,
          studentId: s.pupil.student.id,
          bankItemId: s.item.id,
          version: 1,
          answer: "a",
          correct: true,
          answeredAt: at,
        },
      });
    }
  }
  const remaining = async (s: School) => {
    const res = await api(`${PRACTICE(s)}/options`, { cookie: s.pupil.cookie });
    expect(res.status, res.text.slice(0, 200)).toBe(200);
    return res.json.data.dailyCapRemaining as number;
  };

  test("answers given at the same moment are in today's allowance for one school and not for the other", async () => {
    const { moment, inUtcDay, inFarDay } = between();
    expect(inUtcDay).not.toBe(inFarDay);
    await answeredAt(utc, moment, 4);
    await answeredAt(far, moment, 4);
    expect(await remaining(utc), "the school on UTC").toBe(CAP - (inUtcDay ? 4 : 0));
    expect(await remaining(far), "the school in Kiritimati").toBe(CAP - (inFarDay ? 4 : 0));
  });

  test("a set opened at that moment and not finished holds back the allowance only where it was opened today", async () => {
    const { moment, inUtcDay, inFarDay } = between();
    for (const s of [utc, far]) {
      await db.practiceSession.create({
        data: {
          tenantId: s.tenant.id,
          campusId: s.pupil.student.campusId,
          studentId: s.pupil.student.id,
          subjectLabel: "Mathematics",
          subjectKey: "mathematics",
          size: 6,
          itemIds: [s.item.id],
          startedAt: moment,
        },
      });
    }
    expect(await remaining(utc), "the school on UTC").toBe(CAP - (inUtcDay ? 6 : 0));
    expect(await remaining(far), "the school in Kiritimati").toBe(CAP - (inFarDay ? 6 : 0));
  });

  test("changing the school's time zone moves its day at once (the settings route, not the database)", async () => {
    const { moment, inUtcDay, inFarDay } = between();
    await answeredAt(utc, moment, 3);
    expect(await remaining(utc)).toBe(CAP - (inUtcDay ? 3 : 0));
    expect((await patch(utc.admin, utc, { timeZone: FAR })).status).toBe(200);
    expect(await remaining(utc), "the same answers, now counted in the other day").toBe(CAP - (inFarDay ? 3 : 0));
  });

  test("a stored name that is not a time zone is read as UTC, never a failure", async () => {
    const { moment, inUtcDay } = between();
    await db.$executeRaw`UPDATE "SchoolSettings" SET "timeZone" = 'Not/A_Zone' WHERE "tenantId" = ${far.tenant.id}`;
    await answeredAt(far, moment, 2);
    expect(await remaining(far)).toBe(CAP - (inUtcDay ? 2 : 0));
  });

  /// Twenty reports made at `at` by the school's pupil, all answered, and the pupil having practised the question (a pupil reports only what they were given).
  async function twentyReportsAt(s: School, at: Date) {
    await answeredAt(s, at, 1);
    await db.questionReport.createMany({
      data: Array.from({ length: 20 }, (_, i) => ({
        tenantId: s.tenant.id,
        campusId: s.pupil.student.campusId,
        bankItemId: s.item.id,
        reporterUserId: s.pupil.user.id,
        reporterRole: "PUPIL",
        reporterStudentId: s.pupil.student.id,
        reason: `Report number ${i + 1} on this question.`,
        status: "RESOLVED" as const,
        resolvedAt: at,
        createdAt: at,
      })),
    });
  }
  const reportAgain = (s: School) =>
    api(`/api/v1/schools/${s.tenant.code}/portal/practice/reports`, {
      method: "POST",
      cookie: s.pupil.cookie,
      body: { bankItemId: s.item.id, reason: "One more, after the twenty." },
    });

  test("twenty reports made at the same moment are today's limit for one school and not for the other", async () => {
    const { moment, inUtcDay, inFarDay } = between();
    await twentyReportsAt(utc, moment);
    await twentyReportsAt(far, moment);
    const a = await reportAgain(utc);
    const b = await reportAgain(far);
    expect(a.status, `the school on UTC: ${a.text.slice(0, 120)}`).toBe(inUtcDay ? 429 : 201);
    expect(b.status, `the school in Kiritimati: ${b.text.slice(0, 120)}`).toBe(inFarDay ? 429 : 201);
    if (inUtcDay) expect(a.json.error.code).toBe("REPORT_LIMIT");
    if (inFarDay) expect(b.json.error.code).toBe("REPORT_LIMIT");
  });
});
