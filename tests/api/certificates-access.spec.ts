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

// Who may list, issue and revoke certificates (/certificates): a student reads their own and no one else's; staff and a campus administrator work with their
// campus's students and the school-wide ones; a campus administrator issues for and revokes the certificates of their own campus's students only (a
// school-wide student's are the school administrator's); a school administrator is not held to a campus.

const SAAS = { baseUrl: SAAS_URL };

let a: TestTenant;
let other: TestTenant;
let admin: TestUser;
let campusNorth: TestUser;
let campusSouth: TestUser;
let teacher: TestUser;
let northTeacher: TestUser;
let clerk: TestUser;
let pupilUserNorth: TestUser;
let pupilUserSouth: TestUser;
let unlinkedPupil: TestUser;
let parent: TestUser;
let outsider: TestUser;
const cookie: Record<string, string> = {};

let sNorth: { id: string };
let sSouth: { id: string };
let sWide: { id: string };
// certificate ids by who they belong to
const certs: Record<"north" | "northRevoked" | "south" | "wide", string> = { north: "", northRevoked: "", south: "", wide: "" };
let n = 0;

async function cookieFor(user: TestUser) {
  const res = await loginAs(user, SAAS);
  expect(res.status).toBe(200);
  return cookieHeader(res.token!);
}

test.beforeAll(async () => {
  await seedInstance();
  a = await createTenant({ name: "Alpha Certificate Access", campuses: ["Alpha North", "Alpha South"] });
  other = await createTenant({ name: "Beta Certificate Access" });
  const [north, south] = a.campuses;

  admin = await createUser();
  campusNorth = await createUser();
  campusSouth = await createUser();
  teacher = await createUser();
  northTeacher = await createUser();
  clerk = await createUser();
  pupilUserNorth = await createUser();
  pupilUserSouth = await createUser();
  unlinkedPupil = await createUser();
  parent = await createUser();
  outsider = await createUser();
  await addMembership(admin.id, a.id, Role.ADMIN);
  await addMembership(campusNorth.id, a.id, Role.CAMPUS_ADMIN, north.id);
  await addMembership(campusSouth.id, a.id, Role.CAMPUS_ADMIN, south.id);
  await addMembership(teacher.id, a.id, Role.TEACHING_STAFF);
  await addMembership(northTeacher.id, a.id, Role.TEACHING_STAFF, north.id);
  await addMembership(clerk.id, a.id, Role.NON_TEACHING_STAFF);
  await addMembership(pupilUserNorth.id, a.id, Role.STUDENT, north.id);
  await addMembership(pupilUserSouth.id, a.id, Role.STUDENT, south.id);
  await addMembership(unlinkedPupil.id, a.id, Role.STUDENT);
  await addMembership(parent.id, a.id, Role.PARENT);
  await addMembership(outsider.id, other.id, Role.ADMIN);
  for (const [key, user] of Object.entries({
    admin,
    campusNorth,
    campusSouth,
    teacher,
    northTeacher,
    clerk,
    pupilUserNorth,
    pupilUserSouth,
    unlinkedPupil,
    parent,
    outsider,
  }))
    cookie[key] = await cookieFor(user);

  const pupil = (firstName: string, campusId: string | null, userId: string | null) =>
    db.studentRecord.create({
      data: {
        tenantId: a.id,
        firstName,
        lastName: "Access",
        dateOfBirth: new Date("2004-04-04"),
        admissionNo: `CA-${firstName}-${Date.now()}`,
        campusId,
        userId,
      },
    });
  sNorth = await pupil("Nkem", north.id, pupilUserNorth.id);
  sSouth = await pupil("Sola", south.id, pupilUserSouth.id);
  sWide = await pupil("Wale", null, null);
  const make = async (studentId: string, status: "ISSUED" | "REVOKED") => {
    n += 1;
    return (
      await db.certificate.create({
        data: {
          tenantId: a.id,
          studentId,
          title: `Certificate ${n}`,
          certificateNo: `CA-${Date.now()}-${n}`,
          verificationHash: "d".repeat(64),
          status,
        },
      })
    ).id;
  };
  certs.north = await make(sNorth.id, "ISSUED");
  certs.northRevoked = await make(sNorth.id, "REVOKED");
  certs.south = await make(sSouth.id, "ISSUED");
  certs.wide = await make(sWide.id, "ISSUED");
});

test.afterAll(async () => {
  await removeCreatedTenants();
});

const route = () => `/api/v1/schools/${a.code}/certificates`;
const as = (who: string, extra: object = {}) => ({ ...SAAS, cookie: cookie[who], ...extra });
const list = async (who: string, query = "") => {
  const res = await api(`${route()}${query}`, as(who));
  expect(res.status, `${who}: ${res.text}`).toBe(200);
  return (res.json.data.certificates as Array<{ id: string }>).map((c) => c.id).sort();
};
const issue = (who: string, studentId: string) =>
  api(route(), as(who, { method: "POST", body: { studentId, title: "Certificate in Access Control" } }));
const revoke = (who: string, id: string) => api(`${route()}/${id}/revoke`, as(who, { method: "POST" }));
const sorted = (...ids: string[]) => [...ids].sort();

test.describe("a student reads their own certificates and no one else's", () => {
  test("only the certificates of the student record that is theirs, whatever the filter names", async () => {
    expect(await list("pupilUserNorth")).toEqual(sorted(certs.north, certs.northRevoked));
    expect(await list("pupilUserSouth")).toEqual(sorted(certs.south));
    expect(await list("pupilUserNorth", `?studentId=${sSouth.id}`), "another student named in the filter").toEqual([]);
    expect(await list("pupilUserNorth", `?studentId=${sNorth.id}&status=ISSUED`)).toEqual(sorted(certs.north));
  });

  test("a student account with no student record sees none", async () => {
    expect(await list("unlinkedPupil")).toEqual([]);
  });

  test("a student cannot issue or revoke, and a parent cannot list", async () => {
    expect((await issue("pupilUserNorth", sNorth.id)).status).toBe(403);
    expect((await revoke("pupilUserNorth", certs.north)).status).toBe(403);
    expect((await api(route(), as("parent"))).status).toBe(403);
  });
});

test.describe("staff and a campus administrator work with their campus and the school-wide students", () => {
  test("listing: a campus member sees their campus's and the school-wide students' certificates; a school-wide member sees all", async () => {
    const north = sorted(certs.north, certs.northRevoked, certs.wide);
    expect(await list("campusNorth")).toEqual(north);
    expect(await list("northTeacher")).toEqual(north);
    expect(await list("campusSouth")).toEqual(sorted(certs.south, certs.wide));

    const all = sorted(certs.north, certs.northRevoked, certs.south, certs.wide);
    expect(await list("admin")).toEqual(all);
    expect(await list("teacher")).toEqual(all);
    expect(await list("clerk")).toEqual(all);
  });

  test("a campus member naming another campus's student in the filter gets nothing", async () => {
    expect(await list("campusNorth", `?studentId=${sSouth.id}`)).toEqual([]);
    expect(await list("campusNorth", `?studentId=${sNorth.id}`)).toEqual(sorted(certs.north, certs.northRevoked));
  });
});

test.describe("a campus administrator issues and revokes for their own campus's students only", () => {
  test("issuing: own campus 201; another campus's student 404; a school-wide student 403; unknown 404; nothing is written on a refusal", async () => {
    const before = await db.certificate.count({ where: { tenantId: a.id } });
    expect((await issue("campusNorth", sSouth.id)).status, "another campus").toBe(404);
    expect((await issue("campusNorth", sWide.id)).status, "a school-wide student").toBe(403);
    expect((await issue("campusNorth", "no-such-student")).status, "unknown").toBe(404);
    expect(await db.certificate.count({ where: { tenantId: a.id } })).toBe(before);

    const own = await issue("campusNorth", sNorth.id);
    expect(own.status, own.text).toBe(201);
    expect(await db.certificate.count({ where: { tenantId: a.id } })).toBe(before + 1);
  });

  test("revoking: own campus's 200; another campus's 404; a school-wide student's 403; unknown 404; the refused ones stay ISSUED", async () => {
    const own = await issue("campusNorth", sNorth.id);
    const ownId = own.json.data.certificate.id as string;
    expect((await revoke("campusNorth", certs.south)).status, "another campus").toBe(404);
    expect((await revoke("campusNorth", certs.wide)).status, "a school-wide student").toBe(403);
    expect((await revoke("campusNorth", "no-such-certificate")).status, "unknown").toBe(404);
    expect((await db.certificate.findUniqueOrThrow({ where: { id: certs.south } })).status).toBe("ISSUED");
    expect((await db.certificate.findUniqueOrThrow({ where: { id: certs.wide } })).status).toBe("ISSUED");

    expect((await revoke("campusNorth", ownId)).status).toBe(200);
    expect((await db.certificate.findUniqueOrThrow({ where: { id: ownId } })).status).toBe("REVOKED");
  });

  test("a school administrator is not held to a campus, and teachers and clerks cannot write at all", async () => {
    expect((await issue("admin", sSouth.id)).status).toBe(201);
    expect((await issue("admin", sWide.id)).status).toBe(201);
    const made = await issue("admin", sNorth.id);
    expect((await revoke("admin", made.json.data.certificate.id)).status).toBe(200);

    for (const who of ["teacher", "northTeacher", "clerk"]) {
      expect.soft((await issue(who, sNorth.id)).status, `${who} issuing`).toBe(403);
      expect.soft((await revoke(who, certs.north)).status, `${who} revoking`).toBe(403);
    }
  });

  test("another school's administrator reaches nothing here", async () => {
    const res = await api(route(), as("outsider"));
    expect([403, 404]).toContain(res.status);
  });
});
