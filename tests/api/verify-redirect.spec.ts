import "../support/env";
import { test, expect } from "@playwright/test";
import { SAAS_URL } from "../support/env";
import { createTenant, removeCreatedTenants, seedInstance, uniqueIp, type TestTenant } from "../support/db";
import { api } from "../support/http";
import { newCode, programCertificate, publishedMark, vocationalCertificate } from "../support/verify-world";

// The two public check routes answer a script with JSON and send a browser to the page (task 0043, D5). A QR code printed before this task points at the raw API address of a certificate (or of
// a mark): a phone's camera opens it in a browser, which asks for `text/html`, and is sent on to `/verify/<code>`. What a script gets is unchanged, and so are the limits.

const SAAS = { baseUrl: SAAS_URL };
const BROWSER = { accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8" };
const MARK = (code: string) => `/api/v1/verify/${code}`;
const CERTIFICATE = (code: string) => `/api/v1/verify-certificate/${code}`;

let school: TestTenant;
let mark: Awaited<ReturnType<typeof publishedMark>>;
let vocational: Awaited<ReturnType<typeof vocationalCertificate>>;
let program: Awaited<ReturnType<typeof programCertificate>>;

test.beforeAll(async () => {
  await seedInstance();
  const tag = `R${Date.now().toString(36).toUpperCase()}`;
  school = await createTenant({ name: `${tag} Redirect School` });
  mark = await publishedMark(school, tag);
  vocational = await vocationalCertificate(school, tag);
  program = await programCertificate(school, tag);
});
test.afterAll(async () => {
  await removeCreatedTenants();
});

const routes = [
  ["the mark route", MARK],
  ["the certificate route", CERTIFICATE],
] as const;

for (const [name, route] of routes) {
  test.describe(name, () => {
    test("a browser that opens a well-formed code is sent to the page, by a relative address, for a code the route knows or not", async () => {
      for (const code of [mark.code, vocational.token, program.token, newCode()]) {
        const res = await api(route(code), { ...SAAS, headers: BROWSER });
        expect(res.status, `a browser opening ${route(code)}`).toBe(307);
        // Relative: the browser keeps the host and port it asked for, whatever sits in front of the server.
        expect(res.headers.get("location")).toBe(`/verify/${code}`);
        expect(res.text, "a redirect carries no answer").toBe("");
        expect(res.headers.get("vary") ?? "").toMatch(/accept/i);
        expect(res.headers.get("x-robots-tag")).toMatch(/noindex/);
        expect(res.headers.get("cache-control") ?? "").toMatch(/no-store/);
      }
    });

    test("a script, a fetch for JSON and a request that says nothing about what it wants get the JSON, not the redirect, and the answer says that it varies", async () => {
      const code = name === "the mark route" ? mark.code : vocational.token;
      for (const headers of [{ accept: "*/*" }, { accept: "application/json" }, {} as Record<string, string>]) {
        const res = await api(route(code), { ...SAAS, headers });
        expect(res.status, `Accept ${JSON.stringify(headers)}`).toBe(200);
        expect(res.json?.error, "an answer, not an error").toBeNull();
        expect(res.json?.data, "an answer, not an error").toBeTruthy();
        expect(res.headers.get("location")).toBeNull();
        expect(res.headers.get("vary") ?? "").toMatch(/accept/i);
        expect(res.headers.get("x-robots-tag")).toMatch(/noindex/);
      }
    });

    test("a code that is not well formed is refused whoever asks: a browser is not sent to a page for it", async () => {
      for (const code of ["abc123", "G".repeat(32), "0".repeat(31), "0".repeat(33)]) {
        const res = await api(route(code), { ...SAAS, headers: BROWSER });
        expect(res.status, `a browser opening ${route(code)}`).toBe(400);
        expect(res.headers.get("location")).toBeNull();
        expect(res.headers.get("x-robots-tag")).toMatch(/noindex/);
      }
    });

    test("a redirect costs no attempt, and the limit of 60 in five minutes still stops a script", async () => {
      const ip = uniqueIp();
      // 70 browser visits from one address: all are redirects, none is counted.
      for (let i = 0; i < 70; i++) {
        const res = await api(route(newCode()), { ...SAAS, ip, headers: BROWSER });
        if (res.status !== 307) throw new Error(`visit ${i + 1} was ${res.status}, not a redirect`);
      }
      // So the first 60 lookups of the same address are still answered...
      const first = await api(route(newCode()), { ...SAAS, ip });
      expect(first.status).toBe(404);
      for (let i = 1; i < 60; i++) {
        const res = await api(route(newCode()), { ...SAAS, ip });
        if (res.status !== 404) throw new Error(`lookup ${i + 1} was ${res.status}, not 404`);
      }
      // ...and the 61st is the limit, which is still there for a script. A browser is still sent on: it is not what the limit is for.
      const blocked = await api(route(newCode()), { ...SAAS, ip });
      expect(blocked.status).toBe(429);
      expect(blocked.headers.get("x-robots-tag")).toMatch(/noindex/);
      const browser = await api(route(mark.code), { ...SAAS, ip, headers: BROWSER });
      expect(browser.status).toBe(307);
    });
  });
}

test("the redirect reveals nothing: a code that exists and one that does not look the same to a browser", async () => {
  const [known, unknown] = await Promise.all([
    api(CERTIFICATE(vocational.token), { ...SAAS, headers: BROWSER }),
    api(CERTIFICATE(newCode()), { ...SAAS, headers: BROWSER }),
  ]);
  expect([known.status, unknown.status]).toEqual([307, 307]);
  expect(known.text).toBe(unknown.text);
  expect(known.headers.get("location")?.replace(vocational.token, "X")).toBe(unknown.headers.get("location")?.replace(/[0-9a-f]{32}/, "X"));
});

test("what the certificate route tells a script is unchanged: the vocational and the program answers, with nothing private", async () => {
  const voc = await api(CERTIFICATE(vocational.token), { ...SAAS });
  expect(voc.status).toBe(200);
  const vocData = voc.json?.data;
  expect(vocData).toMatchObject({
    verified: true,
    certificateNo: vocational.certificateNo,
    title: vocational.title,
    studentName: vocational.studentName,
    // The API has always carried the free-form metadata; the PAGE does not show it (the screens spec).
    metadata: { remark: vocational.metadataText },
  });

  const prog = await api(CERTIFICATE(program.token), { ...SAAS });
  expect(prog.status).toBe(200);
  expect(prog.json?.data).toMatchObject({
    kind: "PROGRAM_CERTIFICATE",
    withdrawn: false,
    serialNo: program.serialNo,
    program: program.programName,
    person: program.personMasked,
  });
});
