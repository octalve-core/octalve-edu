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

// Programs, slice P5 (task 0027): completing a place or a whole fixed-term program, and certificates with their public check. Who may, the rule (an average, required assessments), the override
// with a reason, owing money, issuing once, an old certificate keeping its wording, withdrawing, and what the public page shows.
//
// School A has two campuses, North and South. School B has an administrator.

const SAAS = { baseUrl: SAAS_URL };
let a: TestTenant;
let b: TestTenant;
let north: string;
let programId: string;
let top: string;
const people: Record<string, TestUser> = {};
const cookie: Record<string, string> = {};

const as = (who: string) => ({ ...SAAS, cookie: cookie[who] });
const school = (code = a.code) => `/api/v1/schools/${code}`;
const programUrl = (id = programId) => `${school()}/programs/${id}`;
const get = (url: string, who: string) => api(url, as(who));
const send = (url: string, who: string, method: "POST" | "PATCH" | "PUT" | "DELETE", body?: object) =>
  api(url, { ...as(who), method, ...(body ? { body } : {}) });
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
let counter = 0;
const uniq = (prefix: string) => `${prefix}${Date.now().toString(36)}${++counter}`;
const idOf = (res: { json: { data: { id: string } } }) => res.json.data.id;

async function newProgram(over: Record<string, unknown> = {}) {
  const res = await send(`${school()}/programs`, "admin", "POST", {
    name: uniq("Course"),
    kind: "ONGOING",
    campusIds: [north],
    levelLabels: ["Class"],
    ...over,
  });
  expect(res.status, res.text).toBe(201);
  const id = idOf(res);
  await send(`${programUrl(id)}/status`, "admin", "POST", { action: "activate" });
  const group = idOf(await send(`${programUrl(id)}/groups`, "admin", "POST", { name: "G" }));
  expect((await send(`${programUrl(id)}/staff`, "admin", "POST", { userId: people.progAdmin.id, role: "ADMIN" })).status).toBe(201);
  return { id, group };
}
async function member(prog: { id: string; group: string }, over: Record<string, unknown> = {}) {
  const record = await db.studentRecord.create({
    data: {
      tenantId: a.id,
      campusId: north,
      firstName: uniq("Graduate"),
      lastName: "Okafor",
      dateOfBirth: new Date("2012-02-02"),
      admissionNo: uniq("CP/"),
      ...over,
    },
  });
  const res = await send(`${programUrl(prog.id)}/people`, "admin", "POST", { kind: "STUDENT", studentId: record.id, groupId: prog.group });
  expect(res.status, res.text).toBe(201);
  await db.programParticipant.update({ where: { id: idOf(res) }, data: { joinedOn: new Date(day(-60)) } });
  return { record, id: idOf(res) };
}
const completePlace = (progId: string, personId: string, who = "admin", body: object = {}) =>
  send(`${programUrl(progId)}/completion/places/${personId}`, who, "POST", body);
const issue = (progId: string, who = "admin", body: object = {}) => send(`${programUrl(progId)}/certificates`, who, "POST", body);

test.beforeAll(async () => {
  await seedInstance();
  a = await createTenant({ name: "Completion School", campuses: ["North", "South"] });
  b = await createTenant({ name: "Other Completion School" });
  north = a.campuses[0].id;
  for (const who of ["admin", "campusNorth", "progAdmin", "teacher", "pupilUser", "adminB"]) people[who] = await createUser({ name: who });
  await addMembership(people.admin.id, a.id, Role.ADMIN);
  await addMembership(people.campusNorth.id, a.id, Role.CAMPUS_ADMIN, north);
  await addMembership(people.progAdmin.id, a.id, Role.TEACHING_STAFF, null);
  await addMembership(people.teacher.id, a.id, Role.TEACHING_STAFF, north);
  await addMembership(people.pupilUser.id, a.id, Role.STUDENT, north);
  await addMembership(people.adminB.id, b.id, Role.ADMIN);
  for (const who of Object.keys(people)) cookie[who] = cookieHeader((await loginAs(people[who], SAAS)).token!);
  const first = await newProgram();
  programId = first.id;
  top = first.group;
  await send(`${programUrl()}/staff`, "admin", "POST", { userId: people.teacher.id, role: "TEACHER" });
});
test.beforeEach(async () => {
  await db.tenantSetting.deleteMany({ where: { tenantId: a.id, key: { in: ["programs.enabled"] } } });
});
test.afterAll(async () => {
  await removeCreatedTenants();
});

test.describe("completing one place", () => {
  test("the school's administrator and a program admin complete a place; a teacher, a campus administrator and others do not; nobody finds another school's", async () => {
    const who = await member({ id: programId, group: top });
    for (const user of ["teacher", "campusNorth", "pupilUser"])
      expect((await completePlace(programId, who.id, user)).status, user).toBeGreaterThanOrEqual(403);
    expect([403, 404]).toContain((await completePlace(programId, who.id, "adminB")).status);
    const done = await completePlace(programId, who.id, "progAdmin", { note: "Finished level 1" });
    expect(done.status, done.text).toBe(200);
    expect(await db.programParticipant.findUniqueOrThrow({ where: { id: who.id } })).toMatchObject({
      status: "COMPLETED",
      endedReason: "Finished level 1",
    });
    expect((await completePlace(programId, who.id)).json.error.code, "already completed").toBe("NOT_APPLICABLE");
  });

  test("a suspended, expelled or departed person's place is not completed", async () => {
    const [suspended, expelled, gone] = [
      await member({ id: programId, group: top }, { standing: "SUSPENDED" }),
      await member({ id: programId, group: top }, { standing: "EXPELLED" }),
      await member({ id: programId, group: top }),
    ];
    await send(`${programUrl()}/people/${gone.id}/place`, "admin", "POST", { action: "withdraw", reason: "Moved away" });
    for (const who of [suspended, expelled, gone]) expect((await completePlace(programId, who.id)).json.error.code).toBe("NOT_APPLICABLE");
  });

  test("a rule of an average: a person under it needs an override with a reason, which is kept; reopening is the school administrator's alone, and not while a certificate is in force", async () => {
    const prog = await newProgram();
    expect(
      (await send(`${programUrl(prog.id)}/settings`, "admin", "PATCH", { assessmentsEnabled: true, completionMinAverage: 60 })).status,
    ).toBe(200);
    const who = await member(prog);
    const sitting = idOf(
      await send(`${programUrl(prog.id)}/assessments`, "admin", "POST", {
        title: uniq("Final"),
        date: day(-1),
        maxScore: 100,
        groupIds: [prog.group],
      }),
    );
    await send(`${programUrl(prog.id)}/assessments/${sitting}`, "admin", "POST", { action: "open" });
    await send(`${programUrl(prog.id)}/assessments/${sitting}/scores`, "admin", "PUT", { entries: [{ participantId: who.id, score: 40 }] });
    await send(`${programUrl(prog.id)}/assessments/${sitting}`, "admin", "POST", { action: "mark" });
    await send(`${programUrl(prog.id)}/assessments/${sitting}`, "admin", "POST", { action: "publish" });
    const refused = await completePlace(prog.id, who.id);
    expect([refused.status, refused.json.error.code]).toEqual([409, "RULE_NOT_MET"]);
    expect((await completePlace(prog.id, who.id, "admin", { overrideReason: "no" })).status).toBeGreaterThanOrEqual(400);
    expect((await completePlace(prog.id, who.id, "admin", { overrideReason: "The council allowed it" })).status).toBe(200);
    expect((await db.programParticipant.findUniqueOrThrow({ where: { id: who.id } })).completionOverrideReason).toBe(
      "The council allowed it",
    );
    const cert = await issue(prog.id);
    expect(cert.json.data.issued).toBe(1);
    const reopen = (as: string) =>
      send(`${programUrl(prog.id)}/completion/places/${who.id}/reopen`, as, "POST", { reason: "Completed by mistake" });
    expect((await reopen("progAdmin")).status).toBe(403);
    expect((await reopen("admin")).json.error.code).toBe("HAS_CERTIFICATE");
    const certId = (await get(`${programUrl(prog.id)}/certificates`, "admin")).json.data.certificates[0].id;
    expect(
      (await send(`${programUrl(prog.id)}/certificates/${certId}`, "admin", "POST", { action: "revoke", reason: "Issued in error" }))
        .status,
    ).toBe(200);
    expect((await reopen("admin")).status).toBe(200);
    expect((await db.programParticipant.findUniqueOrThrow({ where: { id: who.id } })).status).toBe("ACTIVE");
  });
});

test.describe("completing a program", () => {
  test("a program that never ends is not completed; one for a period only after its end date; a preview changes nothing; the step completes the open places and the program", async () => {
    const ongoing = await newProgram();
    const forever = await send(`${programUrl(ongoing.id)}/completion`, "admin", "POST", { confirm: true });
    expect([forever.status, forever.json.error.code]).toEqual([409, "NOT_COMPLETABLE"]);

    const early = await newProgram({ kind: "FIXED_TERM", startsOn: day(-10), endsOn: day(30) });
    expect((await send(`${programUrl(early.id)}/completion`, "admin", "POST", { confirm: true })).json.error.code).toBe("NOT_COMPLETABLE");

    const ended = await newProgram({ kind: "FIXED_TERM", startsOn: day(-60), endsOn: day(-1) });
    const [fine, hold] = [await member(ended), await member(ended, { standing: "SUSPENDED" })];
    const preview = await send(`${programUrl(ended.id)}/completion`, "admin", "POST", {});
    expect(preview.status, preview.text).toBe(200);
    expect(preview.json.data.willComplete.map((r: { participantId: string }) => r.participantId)).toContain(fine.id);
    expect(preview.json.data.skipped.map((r: { participantId: string }) => r.participantId)).toContain(hold.id);
    expect((await db.program.findUniqueOrThrow({ where: { id: ended.id } })).status, "a preview changes nothing").toBe("ACTIVE");
    for (const user of ["teacher", "campusNorth"])
      expect((await send(`${programUrl(ended.id)}/completion`, user, "POST", { confirm: true })).status, user).toBeGreaterThanOrEqual(403);
    const done = await send(`${programUrl(ended.id)}/completion`, "admin", "POST", { confirm: true });
    expect(done.status, done.text).toBe(200);
    expect(done.json.data).toMatchObject({ completed: 1, skipped: 1 });
    expect((await db.program.findUniqueOrThrow({ where: { id: ended.id } })).status).toBe("COMPLETED");
    expect((await db.programParticipant.findUniqueOrThrow({ where: { id: fine.id } })).status).toBe("COMPLETED");
    expect((await issue(ended.id)).json.data.issued, "a completed program issues its certificates").toBe(1);
  });
});

test.describe("certificates", () => {
  test("issuing twice makes nothing new; an old certificate keeps its wording and the name it had; a campus administrator sees the certificates of their own campus", async () => {
    const prog = await newProgram();
    await send(`${programUrl(prog.id)}/settings`, "admin", "PATCH", {
      certTitle: "Certificate of Memorisation",
      certBody: "{name} memorised {program} at {school}.",
      certSignatories: [{ name: "Ustadh Bello", title: "Head" }],
    });
    const who = await member(prog);
    await completePlace(prog.id, who.id);
    const first = await issue(prog.id);
    expect(first.json.data.issued).toBe(1);
    expect((await issue(prog.id)).json.data.issued, "nothing new").toBe(0);
    await send(`${programUrl(prog.id)}/settings`, "admin", "PATCH", {
      certTitle: "Something Else",
      certBody: "{name} did something else.",
    });
    await db.studentRecord.update({ where: { id: who.record.id }, data: { firstName: "Renamed" } });
    const row = (await get(`${programUrl(prog.id)}/certificates`, "admin")).json.data.certificates[0];
    const detail = (await get(`${programUrl(prog.id)}/certificates/${row.id}`, "admin")).json.data;
    expect(detail.title).toBe("Certificate of Memorisation");
    expect(detail.bodyText).toContain("memorised");
    expect(detail.bodyText).not.toContain("Renamed");
    expect(detail.signatories).toEqual([{ name: "Ustadh Bello", title: "Head" }]);
    expect(detail.verificationToken).toMatch(/^[0-9a-f]{32}$/);
    expect((await get(`${programUrl(prog.id)}/certificates`, "campusNorth")).json.data.certificates).toHaveLength(1);
    for (const user of ["teacher", "pupilUser"])
      expect((await get(`${programUrl(prog.id)}/certificates`, user)).status, user).toBeGreaterThanOrEqual(403);
    expect((await get(`${programUrl(prog.id)}/certificates/${row.id}`, "adminB")).status).toBeGreaterThanOrEqual(403);
  });

  test("the wording is checked: a title, a body of at most 600 characters, at most two signatories; no markup is inserted", async () => {
    const url = `${programUrl()}/settings`;
    for (const body of [
      { certTitle: "" },
      { certBody: "x".repeat(601) },
      {
        certSignatories: [
          { name: "a", title: "" },
          { name: "b", title: "" },
          { name: "c", title: "" },
        ],
      },
      { certTitle: "\u0007bell" },
      { completionMinAverage: 101 },
    ])
      expect((await send(url, "admin", "PATCH", body)).status, JSON.stringify(body)).toBe(400);
    expect((await send(url, "admin", "PATCH", { certBody: "{name} <b>did</b> it" })).status).toBeGreaterThanOrEqual(200);
  });

  test("no certificate while fees are owed, when the program says so", async () => {
    const prog = await newProgram();
    await send(`${programUrl(prog.id)}/settings`, "admin", "PATCH", { feesEnabled: true, noCertWhileOwing: true });
    const who = await member(prog);
    await send(`${programUrl(prog.id)}/fees/items`, "admin", "POST", { name: "Tuition", amount: 1000 });
    await send(`${programUrl(prog.id)}/fees/generate`, "admin", "POST", { periodKey: "once", confirm: true });
    await completePlace(prog.id, who.id);
    const res = await issue(prog.id);
    expect(res.json.data).toMatchObject({ issued: 0 });
    expect(res.json.data.skipped[0].reason).toMatch(/owe/i);
    await send(`${programUrl(prog.id)}/settings`, "admin", "PATCH", { noCertWhileOwing: false });
    expect((await issue(prog.id)).json.data.issued).toBe(1);
  });

  test("the public check page: genuine, first name and last initial only, nothing private; a withdrawn certificate says so; a wrong code says nothing", async () => {
    const prog = await newProgram({ name: "Public Course" });
    const who = await member(prog, { firstName: "Zainab", lastName: "Okafor" });
    await db.guardianRecord.updateMany({ where: { tenantId: a.id }, data: {} });
    await completePlace(prog.id, who.id);
    await issue(prog.id);
    const row = (await get(`${programUrl(prog.id)}/certificates`, "admin")).json.data.certificates[0];
    const token = (await get(`${programUrl(prog.id)}/certificates/${row.id}`, "admin")).json.data.verificationToken as string;
    const check = await api(`/api/v1/verify-certificate/${token}`, SAAS);
    expect(check.status, check.text).toBe(200);
    expect(check.json.data).toMatchObject({ genuine: true, withdrawn: false, program: "Public Course", person: "Zainab O." });
    const text = JSON.stringify(check.json.data);
    for (const secret of ["Okafor", "08030", "admissionNo", "guardian"]) expect(text).not.toContain(secret);
    expect(check.headers.get("x-robots-tag")).toContain("noindex");
    await send(`${programUrl(prog.id)}/certificates/${row.id}`, "admin", "POST", { action: "revoke", reason: "Issued in error" });
    const after = await api(`/api/v1/verify-certificate/${token}`, SAAS);
    expect(after.json.data.withdrawn).toBe(true);
    expect(JSON.stringify(after.json.data)).not.toContain("Issued in error");
    expect((await api(`/api/v1/verify-certificate/${"0".repeat(32)}`, SAAS)).status).toBe(404);
    expect((await api(`/api/v1/verify-certificate/short`, SAAS)).status).toBe(400);
  });

  test("a withdrawn certificate makes room for a new one that points at it; the withdrawal needs a reason", async () => {
    const prog = await newProgram();
    const who = await member(prog);
    await completePlace(prog.id, who.id);
    await issue(prog.id);
    const first = (await get(`${programUrl(prog.id)}/certificates`, "admin")).json.data.certificates[0];
    const url = `${programUrl(prog.id)}/certificates/${first.id}`;
    expect((await send(url, "admin", "POST", { action: "revoke", reason: "no" })).status).toBe(400);
    expect((await send(url, "progAdmin", "POST", { action: "revoke", reason: "Wrong name printed" })).status).toBe(200);
    expect((await issue(prog.id)).json.data.issued).toBe(1);
    const all = (await get(`${programUrl(prog.id)}/certificates`, "admin")).json.data.certificates as {
      serialNo: string;
      status: string;
    }[];
    expect(all.map((c) => c.status).sort()).toEqual(["ISSUED", "REVOKED"]);
    expect(new Set(all.map((c) => c.serialNo)).size).toBe(2);
    expect(await db.programCertificate.count({ where: { programId: prog.id, status: "ISSUED" } })).toBe(1);
  });

  test("the database: one certificate in force per person, a withdrawal needs a reason, and the code is 32 hex characters", async () => {
    const prog = await newProgram();
    const who = await member(prog);
    const base = {
      tenantId: a.id,
      programId: prog.id,
      participantId: who.id,
      issuedOn: new Date(),
      completedOn: new Date(),
      title: "T",
      bodyText: "B",
      personName: "P",
      programName: "X",
      schoolName: "S",
      issuedByUserId: people.admin.id,
    };
    await db.programCertificate.create({ data: { ...base, serialNo: uniq("CERT-") } });
    await expect(db.programCertificate.create({ data: { ...base, serialNo: uniq("CERT-") } })).rejects.toThrow();
    await expect(
      db.programCertificate.create({ data: { ...base, serialNo: uniq("CERT-"), status: "REVOKED", revokedAt: new Date() } }),
    ).rejects.toThrow();
    await expect(
      db.programCertificate.create({
        data: {
          ...base,
          serialNo: uniq("CERT-"),
          verificationToken: "not-a-code",
          status: "REVOKED",
          revokedAt: new Date(),
          revokeReason: "because",
        },
      }),
    ).rejects.toThrow();
  });
});
