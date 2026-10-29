import "../support/env";
import { test, expect } from "@playwright/test";
import sharp from "sharp";
import { SAAS_URL } from "../support/env";
import { DEFAULT_PASSWORD, Role, addMembership, createTenant, createUser, db, enableMfa, removeCreatedTenants, seedInstance, type TestTenant, type TestUser } from "../support/db";
import { api as rawApi, cookieHeader } from "../support/http";
import { createSession } from "@/lib/auth/session";
import { forTenant, type Tx } from "@/lib/tenant/for-tenant";
import { trustedTenantId } from "@/lib/tenant/verified-tenant";
import type { TenantAuthContext } from "@/lib/auth/with-auth";
import { addImage } from "@/lib/question-bank/images-service";

// Pictures on question bank items (task 0024 slice D): add, serve and remove. For each: who may call, the one "Not found" for a question the person may not see (and for another
// school's), what happens to a hostile file (nothing is stored, the question does not change), the limit on pictures, the version and audit rows a change leaves, that what comes
// back carries nothing but pixels, and that the file's key names the school. The server under test keeps its pictures in its own memory; the 503 for "no store" is checked in
// process, where no store is configured.
//
// School A has two campuses, North and South. People: the school's administrator (`admin`), teachers of North (`writer`, `writer2`, `exam`), a non-teaching reviewer of North
// (`reviewer`), a teacher of South (`otherTeacher`), a pupil, and a teacher of school B (`teacherB`).

const SAAS = { baseUrl: SAAS_URL };
const api: typeof rawApi = (path, opts = {}) => rawApi(path, { ...SAAS, ...opts });

let a: TestTenant;
let b: TestTenant;
let north: { id: string };
let south: { id: string };
let ITEMS = "";
type Who = "admin" | "writer" | "writer2" | "reviewer" | "exam" | "otherTeacher" | "student" | "teacherB" | "platform";
const users = {} as Record<Who, TestUser>;
const ck = {} as Record<Who, string>;

const sessionFor = async (user: TestUser) => cookieHeader((await createSession(user.id)).token);

test.beforeAll(async () => {
  await seedInstance();
  a = await createTenant({ name: "Alpha Question Pictures", campuses: ["North", "South"] });
  b = await createTenant({ name: "Beta Question Pictures", campuses: ["Elsewhere"] });
  [north, south] = a.campuses;
  ITEMS = `/api/v1/schools/${a.code}/question-bank/items`;
  const make = async (key: Who, role: Role | null, tenantId: string, campusId: string | null) => {
    users[key] = await createUser({ name: `${key} Person`, platformAdmin: key === "platform" });
    if (role) await addMembership(users[key].id, tenantId, role, campusId);
  };
  await make("admin", Role.ADMIN, a.id, null);
  for (const key of ["writer", "writer2", "exam"] as const) await make(key, Role.TEACHING_STAFF, a.id, north.id);
  await make("reviewer", Role.NON_TEACHING_STAFF, a.id, north.id);
  await make("otherTeacher", Role.TEACHING_STAFF, a.id, south.id);
  await make("student", Role.STUDENT, a.id, north.id);
  await make("teacherB", Role.TEACHING_STAFF, b.id, null);
  await make("platform", null, a.id, null);
  await enableMfa(users.platform.id);
  for (const key of Object.keys(users) as Who[]) ck[key] = await sessionFor(users[key]);
});

test.beforeEach(async () => {
  await db.$executeRawUnsafe(
    `TRUNCATE "QuestionBankAudit", "QuestionBankReview", "QuestionBankItemVersion", "QuestionOverlapFlag", "QuestionBankImage", "QuestionBankClassTag", "QuestionBankItem", "QuestionBankReviewer", "QuestionBankSetting" RESTART IDENTITY CASCADE`,
  );
  await db.questionBankReviewer.create({ data: { tenantId: a.id, userId: users.reviewer.id, assignedById: users.admin.id, scope: "GENERAL", campusId: north.id } });
  await db.questionBankReviewer.create({ data: { tenantId: a.id, userId: users.exam.id, assignedById: users.admin.id, scope: "GENERAL", campusId: north.id, isExamApprover: true } });
});
test.afterAll(async () => {
  await removeCreatedTenants();
});

let counter = 0;
const body = () => {
  counter += 1;
  return {
    type: "SINGLE",
    prompt: `Picture question number ${counter}: which of these words belongs with the entry p${counter}x${counter * 11}?`,
    options: [`alpha${counter}`, `beta${counter}`, `gamma${counter}`],
    correct: 0,
    subject: "Mathematics",
    classTags: ["JSS 1"],
  };
};
const create = async (who: Who) => {
  const res = await api(ITEMS, { method: "POST", cookie: ck[who], body: { campusId: north.id, ...body() } });
  expect(res.status, res.text).toBe(201);
  return res.json.data.item as { id: string };
};
const decide = (who: Who, id: string, action: string, payload: unknown = {}) => api(`${ITEMS}/${id}/${action}`, { method: "POST", cookie: ck[who], body: payload });
// pictures
const GPS = { IFD0: { Copyright: "SECRET-COPYRIGHT-MARK", Software: "SECRET-SOFTWARE-MARK" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "51/1 30/1 0/1", GPSLongitudeRef: "W", GPSLongitude: "0/1 7/1 0/1" } };
const jpegWithGps = () => sharp({ create: { width: 64, height: 48, channels: 3, background: "#3366aa" } }).jpeg().withExif(GPS).toBuffer();
const png = (colour = "#aa3333") => sharp({ create: { width: 40, height: 30, channels: 3, background: colour } }).png().toBuffer();

const form = (file: Uint8Array | null, fields: Record<string, string> = { alt: "A blue rectangle" }, name = "picture.jpg", type = "image/jpeg") => {
  const data = new FormData();
  if (file) data.append("file", new Blob([file as BlobPart], { type }), name);
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
};
const upload = (who: Who | undefined, id: string, data: FormData, url = ITEMS) => api(`${url}/${id}/images`, { method: "POST", cookie: who ? ck[who] : undefined, form: data });
const serve = (who: Who | undefined, id: string, imageId: string, url = ITEMS) => api(`${url}/${id}/images/${imageId}`, { cookie: who ? ck[who] : undefined });
const stored = (id: string) => db.questionBankItem.findUniqueOrThrow({ where: { id }, include: { images: true } });

test.describe("adding and serving a picture", () => {
  test("the writer adds a picture to a draft: the question gets a new version, an audit row, and the picture comes back with nothing but pixels", async () => {
    const item = await create("writer");
    const res = await upload("writer", item.id, form(await jpegWithGps()));
    expect(res.status, res.text).toBe(201);
    const imageId = res.json.data.imageId as string;
    expect(res.json.data.item).toMatchObject({ version: 2, status: "DRAFT" });
    expect(res.json.data.item.images).toEqual([expect.objectContaining({ id: imageId, alt: "A blue rectangle", decorative: false, contentType: "image/jpeg", sortOrder: 0 })]);
    expect(JSON.stringify(res.json)).not.toMatch(/storageKey|octalve\/|question-bank\/img_/); // nothing says where the file lives

    const row = await db.questionBankImage.findUniqueOrThrow({ where: { id: imageId } });
    expect(row).toMatchObject({ tenantId: a.id, itemId: item.id, store: "memory", contentType: "image/jpeg", width: 64, height: 48 });
    expect(row.storageKey).toBe(`octalve/${a.id}/question-bank/${imageId}`); // the school is in the key
    expect(await db.questionBankItemVersion.count({ where: { itemId: item.id, version: 2 } })).toBe(1);
    expect((await db.questionBankAudit.findMany({ where: { action: "IMAGE_ADDED" } }))[0]).toMatchObject({ tenantId: a.id, itemId: item.id, actorUserId: users.writer.id, campusId: north.id });

    const got = await serve("writer", item.id, imageId);
    expect(got.status).toBe(200);
    expect(got.headers.get("content-type")).toBe("image/jpeg");
    expect(got.headers.get("cache-control")).toBe("private, no-store");
    expect(got.headers.get("x-content-type-options")).toBe("nosniff");
    expect(got.headers.get("content-security-policy")).toBe("default-src 'none'; frame-ancestors 'none'"); // the API-wide policy: nothing in it can run or be framed
    expect(got.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    const meta = await sharp(got.bytes).metadata();
    expect(meta).toMatchObject({ format: "jpeg", width: 64, height: 48 });
    expect(meta.exif).toBeUndefined();
    expect(got.bytes.includes(Buffer.from("SECRET-COPYRIGHT-MARK"))).toBe(false);
    expect(got.bytes.includes(Buffer.from("SECRET-SOFTWARE-MARK"))).toBe(false);
    expect(got.bytes.length).toBe(row.bytes);
  });

  test("a decorative picture has no description; any other needs one", async () => {
    const item = await create("writer");
    const file = await png();
    const ok = await upload("writer", item.id, form(file, { decorative: "true" }));
    expect(ok.status, ok.text).toBe(201);
    expect(ok.json.data.item.images[0]).toMatchObject({ decorative: true, alt: "" });
    const refused: Record<string, string>[] = [{}, { alt: "   " }, { alt: "x".repeat(301) }, { alt: "ok", decorative: "true" }, { alt: "ok", decorative: "yes" }, { alt: "bad\u0000text" }, { alt: "hidden‮text" }];
    for (const fields of refused) {
      const res = await upload("writer", item.id, form(file, fields));
      expect(res.status, JSON.stringify(fields)).toBe(400);
    }
    expect(await db.questionBankImage.count({ where: { itemId: item.id } })).toBe(1);
  });

  test("a PNG named .jpg is a PNG; anything that is not a JPEG, PNG or WebP by its content is refused and nothing changes", async () => {
    const item = await create("writer");
    const renamed = await upload("writer", item.id, form(await png(), { alt: "Red" }, "photo.jpg", "image/jpeg"));
    expect(renamed.status, renamed.text).toBe(201);
    expect(renamed.json.data.item.images[0].contentType).toBe("image/png");

    const before = await stored(item.id);
    const hostile: [string, Uint8Array, string][] = [
      ["a script named .png", Buffer.from("<script>alert(1)</script>"), "x.png"],
      ["an SVG", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), "x.svg"],
      ["a GIF", Buffer.from("GIF89a\u0001\u0000\u0001\u0000\u0080\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000;", "latin1"), "x.gif"],
      ["a PDF", Buffer.from("%PDF-1.4 hello"), "x.pdf"],
      ["a cut-off JPEG", (await jpegWithGps()).subarray(0, 120), "x.jpg"],
      ["an empty file", new Uint8Array(0), "x.png"],
    ];
    for (const [what, bytes, name] of hostile) {
      const res = await upload("writer", item.id, form(bytes, { alt: "x" }, name));
      expect(res.status, what).toBe(400);
      expect(res.json.error.code, what).toBe("IMAGE_REJECTED");
    }
    const after = await stored(item.id);
    expect(after.version).toBe(before.version);
    expect(after.images.length).toBe(1);
  });

  test("a file over 8 MB is 413 and is never decoded; a body that is not a form is 415; a broken form, an extra field, two files or none are 400", async () => {
    const item = await create("writer");
    // just over the picture limit and under the form's: the whole body is read, then the picture is refused by its size (a body far over the form's cap is refused unread,
    // and a client still sending then sees the connection closed, which is not something a test can rely on; the cap itself is in tests/unit/read-body.spec.ts)
    const big = await upload("writer", item.id, form(Buffer.alloc(8 * 1024 * 1024 + 10_000, 7)));
    expect(big.status).toBe(413);
    expect(big.json.error.code).toBe("IMAGE_REJECTED");
    const json = await api(`${ITEMS}/${item.id}/images`, { method: "POST", cookie: ck.writer, body: { alt: "x" } });
    expect(json.status).toBe(415);
    const broken = await api(`${ITEMS}/${item.id}/images`, { method: "POST", cookie: ck.writer, rawBody: "garbage", headers: { "content-type": "multipart/form-data; boundary=xyz" } });
    expect(broken.status).toBe(400);
    const file = await png();
    expect((await upload("writer", item.id, form(file, { alt: "x", caption: "no" }))).status).toBe(400);
    expect((await upload("writer", item.id, form(null, { alt: "x" }))).status).toBe(400);
    const two = form(file);
    two.append("file", new Blob([file as BlobPart]), "b.png");
    expect((await upload("writer", item.id, two)).status).toBe(400);
    const asText = new FormData();
    asText.append("file", "not a file");
    asText.append("alt", "x");
    expect((await upload("writer", item.id, asText)).status).toBe(400);
    expect((await stored(item.id)).images.length).toBe(0);
    expect((await stored(item.id)).version).toBe(1);
  });

  test("at most 3 pictures by default (4 when the school allows it); the 4th is a 409 and five at once leave exactly the limit", async () => {
    const item = await create("writer");
    const file = await png();
    for (let i = 0; i < 3; i++) expect((await upload("writer", item.id, form(file))).status).toBe(201);
    const fourth = await upload("writer", item.id, form(file));
    expect(fourth.status).toBe(409);
    expect(fourth.json.error.code).toBe("IMAGE_LIMIT");
    expect((await stored(item.id)).images.map((image) => image.sortOrder).sort()).toEqual([0, 1, 2]);

    await db.questionBankSetting.create({ data: { tenantId: a.id, campusId: null, key: "bank.images.max", value: 4, updatedById: users.admin.id } });
    const racing = await create("writer");
    const results = await Promise.all([1, 2, 3, 4, 5].map(() => upload("writer", racing.id, form(file))));
    expect(results.filter((r) => r.status === 201).length).toBe(4);
    expect(results.filter((r) => r.status === 409).length).toBe(1);
    expect((await stored(racing.id)).images.length).toBe(4);
  });

  test("the limits come from the school's settings: a larger picture is drawn again smaller", async () => {
    const item = await create("writer");
    await db.questionBankSetting.create({ data: { tenantId: a.id, campusId: null, key: "bank.images.maxLongSide", value: 400, updatedById: users.admin.id } });
    const wide = await sharp({ create: { width: 1200, height: 600, channels: 3, background: "#118833" } }).png().toBuffer();
    const res = await upload("writer", item.id, form(wide));
    expect(res.status, res.text).toBe(201);
    const row = (await stored(item.id)).images[0];
    expect(Math.max(row.width, row.height)).toBeLessThanOrEqual(400);
  });
});

test.describe("who may add, serve and remove", () => {
  test("nobody signed out, no pupil, and a teacher of another campus is told nothing; a teacher who cannot see the draft gets 'Not found'", async () => {
    const item = await create("writer");
    const file = await png();
    expect((await upload(undefined, item.id, form(file))).status).toBe(401);
    expect((await upload("student", item.id, form(file))).status).toBe(403);
    expect((await upload("otherTeacher", item.id, form(file))).status).toBe(404);
    expect((await upload("writer2", item.id, form(file))).status).toBe(404);
    expect((await upload("reviewer", item.id, form(file))).status).toBe(404); // a draft is its writer's alone
    expect((await upload("writer", "nope", form(file))).status).toBe(404);
    expect((await upload("writer", "a".repeat(300), form(file))).status).toBe(404);
    expect((await stored(item.id)).images.length).toBe(0);
  });

  test("the writer may change a pending question's pictures, not an approved one's; a reviewer in scope may, and leaves an EDITED review row", async () => {
    const item = await create("writer");
    expect((await decide("writer", item.id, "submit")).status).toBe(200);
    const file = await png();
    const pending = await upload("writer", item.id, form(file));
    expect(pending.status, pending.text).toBe(201);
    expect(pending.json.data.item.status).toBe("PENDING");

    expect((await decide("exam", item.id, "approve", { visibility: "PRACTICE" })).status).toBe(200);
    expect((await upload("writer", item.id, form(file))).status).toBe(403); // approved: no longer the writer's to change
    expect((await upload("writer2", item.id, form(file))).status).toBe(403); // can see it, may not change it
    expect((await upload("otherTeacher", item.id, form(file))).status).toBe(404);

    const byReviewer = await upload("reviewer", item.id, form(file, { alt: "Added by a reviewer" }));
    expect(byReviewer.status, byReviewer.text).toBe(201);
    expect(await db.questionBankReview.count({ where: { itemId: item.id, outcome: "EDITED" } })).toBe(1);
    const imageId = byReviewer.json.data.imageId as string;
    expect((await api(`${ITEMS}/${item.id}/images/${imageId}`, { method: "DELETE", cookie: ck.writer })).status).toBe(403);
    expect((await api(`${ITEMS}/${item.id}/images/${imageId}`, { method: "DELETE", cookie: ck.reviewer })).status).toBe(200);
    expect(await db.questionBankReview.count({ where: { itemId: item.id, outcome: "EDITED" } })).toBe(2);
  });

  test("a picture is served only to those who may see its question: a teachers-only question's picture is 'Not found' to a teacher who does not teach the subject", async () => {
    const item = await create("writer");
    const added = await upload("writer", item.id, form(await png()));
    const imageId = added.json.data.imageId as string;
    expect((await serve(undefined, item.id, imageId)).status).toBe(401);
    expect((await serve("student", item.id, imageId)).status).toBe(403);
    expect((await serve("writer2", item.id, imageId)).status).toBe(404); // a draft
    expect((await serve("writer", item.id, imageId)).status).toBe(200);
    expect((await serve("admin", item.id, imageId)).status).toBe(200);

    expect((await decide("writer", item.id, "submit")).status).toBe(200);
    expect((await decide("reviewer", item.id, "approve")).status).toBe(200); // teachers only
    expect((await serve("writer2", item.id, imageId)).status).toBe(404);
    expect((await serve("reviewer", item.id, imageId)).status).toBe(200);
    await db.questionBankItem.update({ where: { id: item.id }, data: { visibility: "PRACTICE" } });
    expect((await serve("writer2", item.id, imageId)).status).toBe(200);
    expect((await serve("otherTeacher", item.id, imageId)).status).toBe(404); // another campus
  });

  test("a picture asked for under another question's id, or with an id that cannot be one, is the same 'Not found'", async () => {
    const first = await create("writer");
    const second = await create("writer");
    const imageId = (await upload("writer", first.id, form(await png()))).json.data.imageId as string;
    expect((await serve("writer", second.id, imageId)).status).toBe(404);
    expect((await serve("writer", first.id, "missing")).status).toBe(404);
    for (const bad of ["%00", "a".repeat(300), "x y"]) {
      const res = await serve("writer", first.id, bad);
      expect(res.status, bad).toBe(404);
    }
    expect((await api(`${ITEMS}/${second.id}/images/${imageId}`, { method: "DELETE", cookie: ck.writer })).status).toBe(404);
    expect((await stored(first.id)).images.length).toBe(1);
  });

  test("the question bank switched off for staff closes the pictures too; a person whose membership ended a moment ago changes nothing", async () => {
    const item = await create("writer");
    const file = await png();
    const off = await db.questionBankSetting.create({ data: { tenantId: a.id, campusId: north.id, key: "bank.access.staff", value: false, updatedById: users.admin.id } });
    const refused = await upload("writer", item.id, form(file));
    expect(refused.status).toBe(403);
    expect(refused.json.error.code).toBe("BANK_OFF");
    await db.questionBankSetting.delete({ where: { id: off.id } });

    await db.tenantMembership.update({ where: { userId_tenantId: { userId: users.writer.id, tenantId: a.id } }, data: { deactivatedAt: new Date() } });
    expect((await upload("writer", item.id, form(file))).status).toBeGreaterThanOrEqual(401);
    await db.tenantMembership.update({ where: { userId_tenantId: { userId: users.writer.id, tenantId: a.id } }, data: { deactivatedAt: null } });
    expect((await stored(item.id)).images.length).toBe(0);
  });
});

test.describe("another school", () => {
  test("a picture of school A is not there for school B's people, by either school's address, and school B's teacher cannot add one", async () => {
    const item = await create("writer");
    const imageId = (await upload("writer", item.id, form(await png()))).json.data.imageId as string;
    const bItems = `/api/v1/schools/${b.code}/question-bank/items`;
    // through B's own address: A's question is simply not there
    expect((await serve("teacherB", item.id, imageId, bItems)).status).toBe(404);
    expect((await upload("teacherB", item.id, form(await png()), bItems)).status).toBe(404);
    expect((await api(`${bItems}/${item.id}/images/${imageId}`, { method: "DELETE", cookie: ck.teacherB })).status).toBe(404);
    // through A's address: B's teacher is not a member of A
    for (const status of [(await serve("teacherB", item.id, imageId)).status, (await upload("teacherB", item.id, form(await png()))).status]) {
      expect([403, 404]).toContain(status);
    }
    expect((await stored(item.id)).images.length).toBe(1);
    expect((await serve("writer", item.id, imageId)).status).toBe(200);
  });

  test("a platform administrator's support view reaches no picture, even with every grantable area granted", async () => {
    const item = await create("writer");
    const imageId = (await upload("writer", item.id, form(await png()))).json.data.imageId as string;
    const grant = await api(`/api/v1/schools/${a.code}/support-grants`, {
      method: "POST",
      cookie: ck.admin,
      body: { areas: ["settings", "academics", "people", "attendance", "results"], hours: 2, reason: "Ticket 3: checking the question pictures", stepUp: { type: "password", value: DEFAULT_PASSWORD } },
    });
    expect(grant.status, grant.text).toBe(201);
    const opened = await api("/api/v1/platform/support/open", { method: "POST", cookie: ck.platform, body: { code: a.code, password: DEFAULT_PASSWORD } });
    expect(opened.status, opened.text).toBe(200);
    for (const [path, method] of [
      [`${ITEMS}/${item.id}/images/${imageId}`, "GET"],
      [`${ITEMS}/${item.id}/images/${imageId}`, "DELETE"],
      [`${ITEMS}/${item.id}/images`, "POST"],
    ] as const) {
      const res = await api(path, { method, cookie: ck.platform, ...(method === "POST" ? { body: {} } : {}) });
      expect([method, res.status, res.json?.error?.code]).toEqual([method, 403, "FORBIDDEN"]);
    }
  });
});

test.describe("removing a picture", () => {
  test("the writer removes one: the row goes, the question gets a new version and an audit row, and the picture is no longer served", async () => {
    const item = await create("writer");
    const first = (await upload("writer", item.id, form(await png("#111111")))).json.data.imageId as string;
    const second = (await upload("writer", item.id, form(await png("#eeeeee")))).json.data.imageId as string;
    const res = await api(`${ITEMS}/${item.id}/images/${first}`, { method: "DELETE", cookie: ck.writer });
    expect(res.status, res.text).toBe(200);
    expect(res.json.data.item.images.map((i: { id: string }) => i.id)).toEqual([second]);
    expect(res.json.data.item.version).toBe(4);
    expect((await serve("writer", item.id, first)).status).toBe(404);
    expect((await serve("writer", item.id, second)).status).toBe(200);
    expect((await db.questionBankAudit.findMany({ where: { action: "IMAGE_REMOVED" } }))[0]).toMatchObject({ tenantId: a.id, itemId: item.id, actorUserId: users.writer.id });
    expect((await api(`${ITEMS}/${item.id}/images/${first}`, { method: "DELETE", cookie: ck.writer })).status).toBe(404);
    // the freed place can be used again, in the next order
    const again = await upload("writer", item.id, form(await png("#222222")));
    expect(again.status).toBe(201);
    expect(again.json.data.item.images.map((i: { sortOrder: number }) => i.sortOrder)).toEqual([1, 2]);
  });

  test("a retired question keeps its pictures and they can still be read by those who could read it", async () => {
    const item = await create("writer");
    const imageId = (await upload("writer", item.id, form(await png()))).json.data.imageId as string;
    expect((await decide("writer", item.id, "submit")).status).toBe(200);
    expect((await decide("reviewer", item.id, "approve")).status).toBe(200);
    expect((await decide("reviewer", item.id, "retire", { reason: "No longer in the scheme of work." })).status).toBe(200);
    expect((await serve("reviewer", item.id, imageId)).status).toBe(200);
    expect((await stored(item.id)).images.length).toBe(1);
  });
});

test.describe("no store", () => {
  // The runner process has no IMAGE_STORE (and says it is production-shaped), so the in-process service is the "no store" deployment. The servers under test have the memory store.
  test("where no image store is configured the service says so, after checking who is asking, and nothing changes", async () => {
    delete process.env.IMAGE_STORE; // whatever the developer's shell says
    const item = await create("writer");
    const file = await png();
    const ctx = (userId: string): [TenantAuthContext["tenant"], string] => [
      {
        tenantId: trustedTenantId(a.id),
        tenantCode: a.code,
        tenantName: a.name,
        schoolType: "K12",
        role: "TEACHING_STAFF",
        campusId: north.id,
        permissions: [],
        run: <T>(fn: (tx: Tx) => Promise<T>) => forTenant(trustedTenantId(a.id)).transaction(fn),
      },
      userId,
    ];
    const [tenant, userId] = ctx(users.writer.id);
    const refused = await addImage(tenant, { userId, itemId: item.id, bytes: file, alt: "x", decorative: false });
    expect(refused).toMatchObject({ ok: false, status: 503, code: "STORAGE_NOT_CONFIGURED", message: "Image storage is not configured." });
    expect((await stored(item.id)).images.length).toBe(0);
    expect((await stored(item.id)).version).toBe(1);
    // someone who may not change the question is told that, not about the store
    const [, otherId] = ctx(users.writer2.id);
    const denied = await addImage(tenant, { userId: otherId, itemId: item.id, bytes: file, alt: "x", decorative: false });
    expect(denied).toMatchObject({ ok: false, status: 404 });
  });
});
