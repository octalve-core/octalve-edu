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

// A certificate has two names: its number (printed on it, unique within the school) and its verification token (32 hex characters: the
// public link). The public lookup (GET /api/v1/verify-certificate/[token]) takes the token and nothing else, and answers only for an ISSUED certificate.
// Issuing takes the school's next number without colliding with another request or with another school.

const SAAS = { baseUrl: SAAS_URL };
const TOKEN = /^[0-9a-f]{32}$/;

let a: TestTenant;
let admin: TestUser;
let cookieAdmin: string;
let n = 0;

async function cookieFor(user: TestUser) {
  const res = await loginAs(user, SAAS);
  expect(res.status).toBe(200);
  return cookieHeader(res.token!);
}

test.beforeAll(async () => {
  await seedInstance();
  a = await createTenant({ name: "Alpha Certificates" });
  admin = await createUser();
  await addMembership(admin.id, a.id, Role.ADMIN);
  cookieAdmin = await cookieFor(admin);
});

test.afterAll(async () => {
  await removeCreatedTenants();
});

const route = (tenant: TestTenant) => `/api/v1/schools/${tenant.code}/certificates`;
const issue = (tenant: TestTenant, cookie: string, body: object) => api(route(tenant), { ...SAAS, cookie, method: "POST", body });
const verify = (token: string) => api(`/api/v1/verify-certificate/${token}`, { ...SAAS });

async function pupil(tenant: TestTenant, firstName = "Ngozi", lastName = "Eze") {
  n += 1;
  return db.studentRecord.create({
    data: { tenantId: tenant.id, firstName, lastName, dateOfBirth: new Date("2005-05-05"), admissionNo: `CV-${Date.now()}-${n}` },
  });
}

/// A school of its own with an administrator, so a number sequence starts from nothing.
async function freshSchool(name: string) {
  const tenant = await createTenant({ name });
  const owner = await createUser();
  await addMembership(owner.id, tenant.id, Role.ADMIN);
  return { tenant, cookie: await cookieFor(owner) };
}

test.describe("the public lookup takes the token", () => {
  test("issuing returns a 32-character token, and the token opens the lookup with what the holder needs to show and nothing else", async () => {
    const student = await pupil(a);
    const made = await issue(a, cookieAdmin, {
      studentId: student.id,
      title: "Certificate in Solar Installation",
      metadata: { grade: "Distinction" },
    });
    expect(made.status, made.text).toBe(201);
    const cert = made.json.data.certificate;
    expect(cert.verificationToken).toMatch(TOKEN);

    const res = await verify(cert.verificationToken);
    expect(res.status, res.text).toBe(200);
    expect(res.json.data.verified).toBe(true);
    expect(res.json.data.certificateNo).toBe(cert.certificateNo);
    expect(res.json.data.title).toBe("Certificate in Solar Installation");
    expect(res.json.data.studentName).toBe("Ngozi Eze");
    expect(res.json.data.institution).toBe("Alpha Certificates");
    expect(res.json.data.metadata).toEqual({ grade: "Distinction" });
    // what the public sees is exactly this: no ids, no admission number, no token
    expect(Object.keys(res.json.data).sort()).toEqual(
      ["certificateNo", "institution", "issueDate", "metadata", "sessionPeriod", "studentName", "title", "verified"].sort(),
    );
    expect(res.headers.get("cache-control")).toMatch(/no-store/);
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  test("the number is not a way in: a lookup by number, or by anything that is not 32 lower-case hex characters, is a 400, and an unknown token a 404", async () => {
    const student = await pupil(a);
    const made = await issue(a, cookieAdmin, { studentId: student.id, title: "Certificate in Welding" });
    const { certificateNo, verificationToken } = made.json.data.certificate;

    for (const wrong of [
      certificateNo,
      certificateNo.toLowerCase(),
      verificationToken.toUpperCase(),
      verificationToken.slice(1),
      `${verificationToken}0`,
      String.fromCharCode(0),
    ]) {
      const res = await verify(encodeURIComponent(wrong));
      expect.soft(res.status, `${wrong}: ${res.text}`).toBe(400);
      expect.soft(res.json?.error?.code).toBe("INVALID_TOKEN");
      expect.soft(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    }
    expect((await verify("0".repeat(32))).status).toBe(404);
  });

  test("a draft, and a certificate that has been revoked, are not found by their token", async () => {
    const student = await pupil(a);
    const draft = await db.certificate.create({
      data: {
        tenantId: a.id,
        studentId: student.id,
        title: "Draft Certificate",
        certificateNo: `DRAFT-${Date.now()}`,
        verificationHash: "a".repeat(64),
        status: "DRAFT",
      },
    });
    expect(draft.verificationToken).toMatch(TOKEN);
    expect((await verify(draft.verificationToken)).status).toBe(404);

    const made = await issue(a, cookieAdmin, { studentId: student.id, title: "Certificate in Plumbing" });
    const { id, verificationToken } = made.json.data.certificate;
    expect((await verify(verificationToken)).status).toBe(200);

    const revoked = await api(`${route(a)}/${id}/revoke`, { ...SAAS, cookie: cookieAdmin, method: "POST" });
    expect(revoked.status, revoked.text).toBe(200);
    expect((await verify(verificationToken)).status).toBe(404);
  });

  test("tokens are not repeated, and one school's token shows that school's certificate only", async () => {
    const other = await freshSchool("Beta Certificates");
    const ours = await issue(a, cookieAdmin, { studentId: (await pupil(a, "Ada", "Obi")).id, title: "Certificate in Carpentry" });
    const theirs = await issue(other.tenant, other.cookie, {
      studentId: (await pupil(other.tenant, "Bayo", "Ade")).id,
      title: "Certificate in Tailoring",
    });

    const tokens = [ours, theirs].map((res) => res.json.data.certificate.verificationToken as string);
    expect(new Set(tokens).size).toBe(2);
    const seenOurs = await verify(tokens[0]);
    const seenTheirs = await verify(tokens[1]);
    expect([seenOurs.json.data.institution, seenOurs.json.data.studentName]).toEqual(["Alpha Certificates", "Ada Obi"]);
    expect([seenTheirs.json.data.institution, seenTheirs.json.data.studentName]).toEqual(["Beta Certificates", "Bayo Ade"]);
  });
});

test.describe("numbers are the school's own", () => {
  test("two schools each issue their first certificate as …-00001, and the second is not refused", async () => {
    const [one, two] = [await freshSchool("Gamma Certificates"), await freshSchool("Delta Certificates")];
    const first = await issue(one.tenant, one.cookie, { studentId: (await pupil(one.tenant)).id, title: "Certificate in Baking" });
    const second = await issue(two.tenant, two.cookie, { studentId: (await pupil(two.tenant)).id, title: "Certificate in Brewing" });

    expect.soft(first.status, first.text).toBe(201);
    expect.soft(second.status, second.text).toBe(201);
    const year = new Date().getFullYear();
    expect(first.json.data.certificate.certificateNo).toBe(`OCT-VOC-${year}-00001`);
    expect(second.json.data.certificate.certificateNo).toBe(`OCT-VOC-${year}-00001`);
  });

  test("requests that arrive together get different numbers: eight at once are 00001 to 00008, and none is refused", async () => {
    const school = await freshSchool("Epsilon Certificates");
    const pupils = await Promise.all(Array.from({ length: 8 }, () => pupil(school.tenant)));
    const results = await Promise.all(
      pupils.map((s) => issue(school.tenant, school.cookie, { studentId: s.id, title: "Certificate in Masonry" })),
    );

    expect(results.map((r) => r.status)).toEqual(Array(8).fill(201));
    const numbers = results.map((r) => r.json.data.certificate.certificateNo as string).sort();
    const year = new Date().getFullYear();
    expect(numbers).toEqual(Array.from({ length: 8 }, (_, i) => `OCT-VOC-${year}-${String(i + 1).padStart(5, "0")}`));
  });

  test("the prefix is reduced to letters and digits, and one with none in it is the default", async () => {
    const school = await freshSchool("Zeta Certificates");
    const year = new Date().getFullYear();
    const one = await issue(school.tenant, school.cookie, {
      studentId: (await pupil(school.tenant)).id,
      title: "Certificate in Glasswork",
      prefix: "ab-1",
    });
    const two = await issue(school.tenant, school.cookie, {
      studentId: (await pupil(school.tenant)).id,
      title: "Certificate in Pottery",
      prefix: "---",
    });
    expect(one.json.data.certificate.certificateNo).toBe(`AB1-VOC-${year}-00001`);
    expect(two.json.data.certificate.certificateNo).toBe(`OCT-VOC-${year}-00002`);
  });
});

test.describe("issuing refuses what is not this school's, and never answers with a database message", () => {
  test("a student of another school, an unknown student, and an unknown period are a 404 and nothing is written", async () => {
    const other = await freshSchool("Eta Certificates");
    const foreign = await pupil(other.tenant);
    const mine = await pupil(a);
    const before = await db.certificate.count({ where: { tenantId: a.id } });

    for (const body of [
      { studentId: foreign.id, title: "Certificate in Surveying" },
      { studentId: "no-such-student", title: "Certificate in Surveying" },
      { studentId: mine.id, periodId: "no-such-period", title: "Certificate in Surveying" },
    ]) {
      const res = await issue(a, cookieAdmin, body);
      expect.soft(res.status, `${JSON.stringify(body)}: ${res.text}`).toBe(404);
      expect.soft(res.json?.error?.code).toBe("NOT_FOUND");
    }
    expect(await db.certificate.count({ where: { tenantId: a.id } })).toBe(before);
  });

  test("an id that cannot be an id is a 400 in the body, in the query and in the path, not a server error", async () => {
    const nul = `a${String.fromCharCode(0)}b`;
    const mine = await pupil(a);
    expect.soft((await issue(a, cookieAdmin, { studentId: nul, title: "Certificate in Roofing" })).status).toBe(400);
    expect.soft((await issue(a, cookieAdmin, { studentId: mine.id, periodId: nul, title: "Certificate in Roofing" })).status).toBe(400);
    expect.soft((await api(`${route(a)}?studentId=${encodeURIComponent(nul)}`, { ...SAAS, cookie: cookieAdmin })).status).toBe(400);
    expect
      .soft((await api(`${route(a)}/${encodeURIComponent(nul)}/revoke`, { ...SAAS, cookie: cookieAdmin, method: "POST" })).status)
      .toBe(404);
  });

  test("revoking a certificate that does not exist is a 404, and revoking twice is harmless", async () => {
    expect((await api(`${route(a)}/no-such-certificate/revoke`, { ...SAAS, cookie: cookieAdmin, method: "POST" })).status).toBe(404);
    const made = await issue(a, cookieAdmin, { studentId: (await pupil(a)).id, title: "Certificate in Tiling" });
    const id = made.json.data.certificate.id;
    expect((await api(`${route(a)}/${id}/revoke`, { ...SAAS, cookie: cookieAdmin, method: "POST" })).status).toBe(200);
    expect((await api(`${route(a)}/${id}/revoke`, { ...SAAS, cookie: cookieAdmin, method: "POST" })).status).toBe(200);
  });
});
