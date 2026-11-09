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

// Programs, slice P1 (task 0027) over real HTTP: who may make a program, who sees it and who changes it (the school's administrator; a program admin named by them; a campus
// administrator reads the programs that run in their campus), the lifecycle (draft, active, archived, restored), the program's own level names and its tree of groups, the campuses it
// runs in, the audit, the school's `programs.enabled` switch (with the fresh proof) and what another school or another campus never reaches.
//
// School A has two campuses, North and South. People: its administrator, a campus administrator of each campus, a teacher in each campus, a clerk with no campus, a pupil and a guardian.
// School B has an administrator.

const SAAS = { baseUrl: SAAS_URL };
let a: TestTenant;
let b: TestTenant;
let north: string;
let south: string;
const people: Record<string, TestUser> = {};
const cookie: Record<string, string> = {};

const as = (who: string) => ({ ...SAAS, cookie: cookie[who] });
const proof = (who: string) => ({ type: "password", value: people[who].password });
const school = (code = a.code) => `/api/v1/schools/${code}`;
const programsUrl = (code = a.code) => `${school(code)}/programs`;
const programUrl = (id: string, code = a.code) => `${programsUrl(code)}/${id}`;
const get = (url: string, who: string) => api(url, as(who));
const send = (url: string, who: string, method: "POST" | "PATCH" | "PUT" | "DELETE", body?: object) =>
  api(url, { ...as(who), method, ...(body ? { body } : {}) });
let counter = 0;
const uniq = (prefix: string) => `${prefix} ${Date.now().toString(36)}${++counter}`;

const LEVELS = ["Section", "Class"];
type Make = { name?: string; campusIds?: string[]; levelLabels?: string[]; kind?: "ONGOING" | "FIXED_TERM" } & Record<string, unknown>;
/// A program made by the school's administrator (a draft), returning its id.
async function make(over: Make = {}, who = "admin") {
  const res = await send(programsUrl(), who, "POST", {
    name: uniq("Hifz"),
    kind: "ONGOING",
    campusIds: [north],
    levelLabels: LEVELS,
    ...over,
  });
  expect(res.status, res.text).toBe(201);
  return res.json.data.id as string;
}
const detail = async (id: string, who = "admin") => (await get(programUrl(id), who)).json.data;
const turnOn = async () => {
  await db.tenantSetting.deleteMany({ where: { tenantId: a.id, key: "programs.enabled" } });
};

test.beforeAll(async () => {
  await seedInstance();
  a = await createTenant({ name: "Programs School", campuses: ["North", "South"] });
  b = await createTenant({ name: "Other Programs School" });
  [north, south] = [a.campuses[0].id, a.campuses[1].id];
  for (const who of ["admin", "campusNorth", "campusSouth", "teacherNorth", "teacherSouth", "clerk", "pupil", "guardian", "adminB"])
    people[who] = await createUser({ name: who });
  await addMembership(people.admin.id, a.id, Role.ADMIN);
  await addMembership(people.campusNorth.id, a.id, Role.CAMPUS_ADMIN, north);
  await addMembership(people.campusSouth.id, a.id, Role.CAMPUS_ADMIN, south);
  await addMembership(people.teacherNorth.id, a.id, Role.TEACHING_STAFF, north);
  await addMembership(people.teacherSouth.id, a.id, Role.TEACHING_STAFF, south);
  await addMembership(people.clerk.id, a.id, Role.NON_TEACHING_STAFF, null);
  await addMembership(people.pupil.id, a.id, Role.STUDENT, north);
  await addMembership(people.guardian.id, a.id, Role.PARENT);
  await addMembership(people.adminB.id, b.id, Role.ADMIN);
  for (const who of Object.keys(people)) cookie[who] = cookieHeader((await loginAs(people[who], SAAS)).token!);
});
test.beforeEach(turnOn);
test.afterAll(async () => {
  await removeCreatedTenants();
});

test.describe("reaching the routes", () => {
  test("nobody signed out, and no pupil or guardian, reaches a program; another school's administrator reaches nothing of this school's", async () => {
    const id = await make();
    for (const url of [programsUrl(), programUrl(id), `${programUrl(id)}/admins`, `${school()}/settings/programs`]) {
      expect((await api(url, SAAS)).status, url).toBe(401);
      for (const who of ["pupil", "guardian"]) expect((await get(url, who)).status, `${who} ${url}`).toBe(403);
      expect([403, 404], `adminB ${url}`).toContain((await get(url, "adminB")).status);
    }
    expect((await send(programsUrl(), "pupil", "POST", { name: "x", kind: "ONGOING", levelLabels: ["a"] })).status).toBe(403);
    expect([403, 404]).toContain((await send(programUrl(id), "adminB", "PATCH", { name: "Taken over" })).status);
    expect((await detail(id)).name).not.toBe("Taken over");
  });
});

test.describe("making a program", () => {
  test("only the school's administrator makes one; it starts as a draft with its campuses and level names, and the creation is audited", async () => {
    for (const who of ["campusNorth", "teacherNorth", "clerk"])
      expect(
        (await send(programsUrl(), who, "POST", { name: "Nope", kind: "ONGOING", campusIds: [north], levelLabels: LEVELS })).status,
        who,
      ).toBe(403);
    const id = await make({ name: "Quran memorisation", description: "  Morning classes  ", campusIds: [north, south] });
    const d = await detail(id);
    expect(d).toMatchObject({
      name: "Quran memorisation",
      description: "Morning classes",
      kind: "ONGOING",
      status: "DRAFT",
      startsOn: null,
      endsOn: null,
      schoolWide: false,
      levelLabels: LEVELS,
      access: "SUPER",
    });
    expect(d.campuses.map((c: { name: string }) => c.name)).toEqual(["North", "South"]);
    expect(d.audit.map((e: { action: string }) => e.action)).toEqual(["PROGRAM_CREATED"]);
    expect(d.can).toMatchObject({ editDetails: true, editStructure: true, administer: true, restore: false });
  });

  test("a program for a period has its end worked out as start plus duration minus a day; with no campus it runs school-wide", async () => {
    const id = await make({ kind: "FIXED_TERM", startsOn: "2026-11-03", duration: { value: 6, unit: "MONTHS" }, campusIds: [] });
    expect(await detail(id)).toMatchObject({
      kind: "FIXED_TERM",
      startsOn: "2026-11-03",
      endsOn: "2027-05-02",
      schoolWide: true,
      campuses: [],
    });
    const dated = await make({ kind: "FIXED_TERM", startsOn: "2026-09-01", endsOn: "2027-06-30" });
    expect(await detail(dated)).toMatchObject({ startsOn: "2026-09-01", endsOn: "2027-06-30" });
  });

  test("a request that is not a program is refused with the field named, and nothing is made", async () => {
    const before = (await get(programsUrl(), "admin")).json.data.programs.length;
    const bad: object[] = [
      { kind: "ONGOING", levelLabels: LEVELS },
      { name: "  ", kind: "ONGOING", levelLabels: LEVELS },
      { name: "X", kind: "SOMETIMES", levelLabels: LEVELS },
      { name: "X", kind: "ONGOING", levelLabels: [] },
      { name: "X", kind: "ONGOING", levelLabels: ["a", "b", "c", "d", "e"] },
      { name: "X", kind: "ONGOING", levelLabels: ["Class", "class"] },
      { name: "X", kind: "ONGOING", levelLabels: LEVELS, endsOn: "2027-01-01" },
      { name: "X", kind: "FIXED_TERM", levelLabels: LEVELS },
      { name: "X", kind: "FIXED_TERM", startsOn: "2026-02-30", duration: { value: 3, unit: "MONTHS" }, levelLabels: LEVELS },
      { name: "X", kind: "FIXED_TERM", startsOn: "2026-11-03", endsOn: "2026-11-03", levelLabels: LEVELS },
      { name: "X", kind: "ONGOING", levelLabels: LEVELS, campusIds: [north, north] },
      { name: "X", kind: "ONGOING", levelLabels: LEVELS, surprise: true },
      { name: "X\u0000", kind: "ONGOING", levelLabels: LEVELS },
    ];
    for (const body of bad) expect((await send(programsUrl(), "admin", "POST", body)).status, JSON.stringify(body)).toBe(400);
    const unknown = await send(programsUrl(), "admin", "POST", {
      name: "X",
      kind: "ONGOING",
      levelLabels: LEVELS,
      campusIds: ["no-such-campus"],
    });
    expect(unknown.status).toBe(400);
    expect(unknown.json.error.details[0].path).toBe("body.campusIds");
    // another school's campus is no campus of this school's
    const foreign = await send(programsUrl(), "admin", "POST", {
      name: "X",
      kind: "ONGOING",
      levelLabels: LEVELS,
      campusIds: [b.campuses[0]?.id ?? "x"],
    });
    expect(foreign.status).toBe(400);
    expect((await get(programsUrl(), "admin")).json.data.programs).toHaveLength(before);
  });

  test("a live program's name is its own, ignoring case and spacing; an archived program's name can be used again", async () => {
    const name = uniq("Tajweed");
    const id = await make({ name });
    const same = await send(programsUrl(), "admin", "POST", {
      name: `  ${name.toUpperCase()} `,
      kind: "ONGOING",
      campusIds: [north],
      levelLabels: LEVELS,
    });
    expect(same.status).toBe(409);
    expect(same.json.error.code).toBe("DUPLICATE");
    expect((await send(`${programUrl(id)}/status`, "admin", "POST", { action: "archive" })).status).toBe(200);
    const again = await make({ name });
    expect(again).not.toBe(id);
    // and the archived one cannot be brought back while the name is taken
    const restore = await send(`${programUrl(id)}/status`, "admin", "POST", { action: "restore" });
    expect(restore.status).toBe(409);
    expect(restore.json.error.code).toBe("DUPLICATE");
  });
});

test.describe("who sees a program", () => {
  test("the school's administrator sees them all; a campus administrator only the programs that run in their campus; nobody else sees any", async () => {
    const inNorth = await make({ campusIds: [north] });
    const inSouth = await make({ campusIds: [south] });
    const everywhere = await make({ campusIds: [] });
    const ids = async (who: string) => (await get(programsUrl(), who)).json.data.programs.map((p: { id: string }) => p.id);
    const all = await ids("admin");
    for (const id of [inNorth, inSouth, everywhere]) expect(all).toContain(id);
    const seenNorth = await ids("campusNorth");
    expect(seenNorth).toContain(inNorth);
    expect(seenNorth).not.toContain(inSouth);
    expect(seenNorth).not.toContain(everywhere); // a school-wide program is not a campus's
    expect(await ids("teacherNorth")).toEqual([]);
    expect(await ids("clerk")).toEqual([]);
    expect((await get(programUrl(inSouth), "campusNorth")).status).toBe(404); // the same answer as one that does not exist
    expect((await get(programUrl(everywhere), "campusNorth")).status).toBe(404);
    expect((await get(programUrl(inNorth), "teacherNorth")).status).toBe(404);
    expect((await get(programUrl("no-such-program"), "admin")).status).toBe(404);
    expect((await get(programUrl("../etc"), "admin")).status).toBe(404);
  });

  test("a campus administrator reads their program and changes none of it", async () => {
    const id = await make({ campusIds: [north] });
    expect(await detail(id, "campusNorth")).toMatchObject({
      access: "CAMPUS",
      can: { editDetails: false, editStructure: false, administer: false, restore: false },
      audit: null,
    });
    const d = await detail(id, "campusNorth");
    expect(d.admins.every((x: { email: unknown }) => x.email === null)).toBe(true);
    for (const [url, method, body] of [
      [programUrl(id), "PATCH", { name: "Mine now" }],
      [`${programUrl(id)}/status`, "POST", { action: "archive" }],
      [`${programUrl(id)}/levels`, "PUT", { labels: ["One"] }],
      [`${programUrl(id)}/groups`, "POST", { name: "G" }],
      [`${programUrl(id)}/campuses`, "POST", { campusId: south }],
      [`${programUrl(id)}/admins`, "POST", { userId: people.teacherNorth.id }],
    ] as const)
      expect((await send(url, "campusNorth", method, body)).status, `${method} ${url}`).toBe(403);
    expect((await detail(id)).name).not.toBe("Mine now");
  });
});

test.describe("program admins", () => {
  test("the school's administrator names a program admin; they then see and change the program, and nobody else's; a person outside the program's campuses cannot be named", async () => {
    const id = await make({ campusIds: [north] });
    const other = await make({ campusIds: [north] });
    expect((await send(`${programUrl(id)}/admins`, "admin", "POST", { userId: people.teacherSouth.id })).status).toBe(400); // South's teacher, a North program
    expect((await send(`${programUrl(id)}/admins`, "admin", "POST", { userId: people.pupil.id })).status).toBe(400); // a pupil is no staff
    expect((await send(`${programUrl(id)}/admins`, "admin", "POST", { userId: "no-such-user" })).status).toBe(400);
    const named = await send(`${programUrl(id)}/admins`, "admin", "POST", { userId: people.teacherNorth.id });
    expect(named.status, named.text).toBe(201);
    expect((await send(`${programUrl(id)}/admins`, "admin", "POST", { userId: people.teacherNorth.id })).status).toBe(409); // already

    expect(await detail(id, "teacherNorth")).toMatchObject({
      access: "ADMIN",
      can: { editDetails: true, editStructure: true, administer: false },
    });
    expect((await send(programUrl(id), "teacherNorth", "PATCH", { description: "By the program admin" })).status).toBe(200);
    expect((await get(programUrl(other), "teacherNorth")).status).toBe(404);
    const seen = (await get(programsUrl(), "teacherNorth")).json.data.programs.map((p: { id: string }) => p.id);
    expect(seen).toContain(id);
    expect(seen).not.toContain(other);
    // a program admin changes the program; they name nobody, and cannot create programs
    expect((await send(`${programUrl(id)}/admins`, "teacherNorth", "POST", { userId: people.clerk.id })).status).toBe(403);
    expect((await get(`${programUrl(id)}/admins`, "teacherNorth")).status).toBe(403);
    expect((await send(programsUrl(), "teacherNorth", "POST", { name: "Mine", kind: "ONGOING", levelLabels: LEVELS })).status).toBe(403);
    expect((await send(`${programUrl(id)}/campuses`, "teacherNorth", "POST", { campusId: south })).status).toBe(403);
    const candidates = (await get(`${programUrl(id)}/admins`, "admin")).json.data.candidates.map((c: { userId: string }) => c.userId);
    expect(candidates).not.toContain(people.teacherNorth.id); // already running it
    expect(candidates).not.toContain(people.teacherSouth.id);
    expect(candidates).toContain(people.clerk.id); // no campus: the whole school
  });

  test("a program admin's authority is read at every request: ending the place, or deactivating the membership, ends it at once", async () => {
    const id = await make({ campusIds: [north] });
    const placeId = (await send(`${programUrl(id)}/admins`, "admin", "POST", { userId: people.teacherNorth.id })).json.data.id;
    expect((await get(programUrl(id), "teacherNorth")).status).toBe(200);
    const membership = await db.tenantMembership.findFirstOrThrow({ where: { tenantId: a.id, userId: people.teacherNorth.id } });
    await db.tenantMembership.update({ where: { id: membership.id }, data: { deactivatedAt: new Date() } });
    expect((await get(programUrl(id), "teacherNorth")).status).toBe(403); // a deactivated membership is no member of the school: refused at the door, like anyone else
    await db.tenantMembership.update({ where: { id: membership.id }, data: { deactivatedAt: null } });
    expect((await get(programUrl(id), "teacherNorth")).status).toBe(200);
    expect((await send(`${programUrl(id)}/admins/${placeId}`, "teacherNorth", "DELETE")).status).toBe(403); // not their own to end
    expect((await send(`${programUrl(id)}/admins/${placeId}`, "admin", "DELETE")).status).toBe(200);
    expect((await get(programUrl(id), "teacherNorth")).status).toBe(404);
    expect((await send(`${programUrl(id)}/admins/${placeId}`, "admin", "DELETE")).status).toBe(200); // ending it again changes nothing
    // named again: it starts afresh
    expect((await send(`${programUrl(id)}/admins`, "admin", "POST", { userId: people.teacherNorth.id })).status).toBe(201);
    expect((await get(programUrl(id), "teacherNorth")).status).toBe(200);
    const actions = (await detail(id)).audit.map((e: { action: string }) => e.action);
    expect(actions).toEqual(expect.arrayContaining(["ADMIN_NAMED", "ADMIN_ENDED"]));
  });

  test("a school-wide program takes a staff member of any campus; the campus of a place that no longer fits ends its authority", async () => {
    const id = await make({ campusIds: [] });
    expect((await send(`${programUrl(id)}/admins`, "admin", "POST", { userId: people.teacherSouth.id })).status).toBe(201);
    expect((await get(programUrl(id), "teacherSouth")).status).toBe(200);
    const narrow = await make({ campusIds: [north] });
    await db.programStaff.create({
      data: { tenantId: a.id, programId: narrow, userId: people.teacherSouth.id, role: "ADMIN", createdByUserId: people.admin.id },
    });
    expect((await get(programUrl(narrow), "teacherSouth")).status).toBe(404); // a place the program does not cover is no authority
  });
});

test.describe("the lifecycle", () => {
  test("activate, archive and restore; an archived program is read only; restore is the school's administrator's alone", async () => {
    const id = await make({ campusIds: [north] });
    await send(`${programUrl(id)}/admins`, "admin", "POST", { userId: people.teacherNorth.id });
    const status = (who: string, action: string) => send(`${programUrl(id)}/status`, who, "POST", { action });
    expect((await status("admin", "restore")).status).toBe(409); // a draft is not restored
    expect((await status("campusNorth", "activate")).status).toBe(403);
    expect((await status("teacherNorth", "activate")).status).toBe(200);
    expect((await detail(id)).status).toBe("ACTIVE");
    expect((await status("admin", "activate")).status).toBe(409);
    expect((await status("teacherNorth", "archive")).status).toBe(200);
    const archived = await detail(id);
    expect(archived).toMatchObject({ status: "ARCHIVED", can: { editDetails: false, editStructure: false, restore: true } });
    for (const [url, method, body] of [
      [programUrl(id), "PATCH", { name: "Changed" }],
      [`${programUrl(id)}/levels`, "PUT", { labels: ["One"] }],
      [`${programUrl(id)}/groups`, "POST", { name: "G" }],
    ] as const) {
      const res = await send(url, "admin", method, body);
      expect(res.status, `${method} ${url}`).toBe(409);
      expect(res.json.error.code).toBe("PROGRAM_READ_ONLY");
    }
    expect((await status("teacherNorth", "restore")).status).toBe(403);
    expect((await status("admin", "restore")).status).toBe(200);
    expect((await detail(id)).status).toBe("DRAFT");
    expect((await detail(id)).audit.map((e: { action: string }) => e.action)).toEqual(
      expect.arrayContaining(["PROGRAM_ACTIVATED", "PROGRAM_ARCHIVED", "PROGRAM_RESTORED"]),
    );
  });

  test("details change one by one, the audit keeps the old and the new, and a change that changes nothing writes nothing", async () => {
    const id = await make({
      name: uniq("Old name"),
      description: "First",
      kind: "FIXED_TERM",
      startsOn: "2026-11-03",
      endsOn: "2027-05-02",
      campusIds: [north],
    });
    const before = (await detail(id)).audit.length;
    const rename = uniq("New name");
    expect((await send(programUrl(id), "admin", "PATCH", { name: rename, description: null })).status).toBe(200);
    expect(await detail(id)).toMatchObject({ name: rename, description: null });
    const after = (await detail(id)).audit;
    expect(after.length).toBe(before + 1);
    expect(after[0].action).toBe("PROGRAM_CHANGED");
    expect((await send(programUrl(id), "admin", "PATCH", { name: rename })).status).toBe(200);
    expect((await detail(id)).audit.length).toBe(before + 1);
    // a fixed-term program keeps both dates in order
    expect((await send(programUrl(id), "admin", "PATCH", { endsOn: null })).status).toBe(400);
    expect((await send(programUrl(id), "admin", "PATCH", { endsOn: "2026-11-03" })).status).toBe(400);
    expect((await send(programUrl(id), "admin", "PATCH", { startsOn: "2026-02-30" })).status).toBe(400);
    expect((await send(programUrl(id), "admin", "PATCH", { endsOn: "2027-06-30" })).status).toBe(200);
    const ongoing = await make({});
    expect((await send(programUrl(ongoing), "admin", "PATCH", { endsOn: "2027-06-30" })).status).toBe(400); // never ends
    expect((await send(programUrl(id), "admin", "PATCH", {})).status).toBe(400);
    expect((await send(programUrl(id), "admin", "PATCH", { kind: "ONGOING" })).status).toBe(400); // not changeable
  });
});

test.describe("levels and groups", () => {
  const add = (id: string, name: string, parentId?: string, who = "admin") =>
    send(`${programUrl(id)}/groups`, who, "POST", { name, ...(parentId ? { parentId } : {}) });

  test("a group sits at a level that has a name; the tree keeps its order and its paths; a group cannot go below the last level", async () => {
    const id = await make({ levelLabels: ["Section", "Class"] });
    const jss1 = (await add(id, "JSS 1")).json.data;
    expect(jss1.levelIndex).toBe(0);
    const jss2 = (await add(id, "JSS 2")).json.data;
    const classA = await add(id, "A", jss1.id);
    expect(classA.status).toBe(201);
    expect(classA.json.data.levelIndex).toBe(1);
    const tooDeep = await add(id, "Row 1", classA.json.data.id);
    expect(tooDeep.status).toBe(409);
    expect(tooDeep.json.error.code).toBe("NO_LEVEL");
    const d = await detail(id);
    expect(d.groups.map((g: { path: string }) => g.path)).toEqual(["JSS 1", "JSS 2", "JSS 1–A"]);
    expect(d.groups.find((g: { id: string }) => g.id === jss2.id)).toMatchObject({ parentId: null, levelIndex: 0, archived: false });
  });

  test("namesakes among siblings are refused, ignoring case and spacing, and the same name is fine under another group; renaming obeys the same rule", async () => {
    const id = await make({ levelLabels: ["Section", "Class"] });
    const first = (await add(id, "JSS 1")).json.data.id;
    const second = (await add(id, "JSS 2")).json.data.id;
    const dup = await add(id, "  jss   1 ");
    expect(dup.status).toBe(409);
    expect(dup.json.error.details[0].path).toBe("body.name");
    expect((await add(id, "A", first)).status).toBe(201);
    expect((await add(id, "A", second)).status).toBe(201);
    expect((await send(`${programUrl(id)}/groups/${second}`, "admin", "PATCH", { name: "jss 1" })).status).toBe(409);
    expect((await send(`${programUrl(id)}/groups/${second}`, "admin", "PATCH", { name: "JSS 3" })).status).toBe(200);
    expect((await send(`${programUrl(id)}/groups/${second}`, "admin", "PATCH", { name: "JSS 3" })).status).toBe(200); // nothing changes
  });

  test("a group moves up and down among its live siblings and stops at the ends", async () => {
    const id = await make({});
    const ids = [(await add(id, "One")).json.data.id, (await add(id, "Two")).json.data.id, (await add(id, "Three")).json.data.id];
    const order = async () => (await detail(id)).groups.map((g: { name: string }) => g.name);
    expect(await order()).toEqual(["One", "Two", "Three"]);
    expect((await send(`${programUrl(id)}/groups/${ids[2]}`, "admin", "PATCH", { move: "up" })).status).toBe(200);
    expect(await order()).toEqual(["One", "Three", "Two"]);
    expect((await send(`${programUrl(id)}/groups/${ids[0]}`, "admin", "PATCH", { move: "up" })).status).toBe(200); // already first
    expect(await order()).toEqual(["One", "Three", "Two"]);
    expect((await send(`${programUrl(id)}/groups/${ids[0]}`, "admin", "PATCH", { move: "down" })).status).toBe(200);
    expect(await order()).toEqual(["Three", "One", "Two"]);
  });

  test("a group with live groups inside is not archived; archived groups come back where their parent is live and the name is free", async () => {
    const id = await make({ levelLabels: ["Section", "Class"] });
    const parent = (await add(id, "JSS 1")).json.data.id;
    const child = (await add(id, "A", parent)).json.data.id;
    const archive = (group: string, archived = true) => send(`${programUrl(id)}/groups/${group}`, "admin", "PATCH", { archived });
    const blocked = await archive(parent);
    expect(blocked.status).toBe(409);
    expect(blocked.json.error.code).toBe("HAS_GROUPS");
    expect((await archive(child)).status).toBe(200);
    expect((await archive(parent)).status).toBe(200);
    expect((await add(id, "A", parent)).status).toBe(404); // an archived parent is not there
    expect((await archive(child, false)).status).toBe(409); // its parent is archived
    expect((await send(`${programUrl(id)}/groups/${parent}`, "admin", "PATCH", { move: "up" })).status).toBe(409); // an archived group is not moved
    expect((await add(id, "JSS 1")).status).toBe(201); // the name of an archived group is free again
    expect((await archive(parent, false)).status).toBe(409); // ...so it cannot return while it is taken
    expect((await detail(id)).audit.map((e: { action: string }) => e.action)).toEqual(
      expect.arrayContaining(["GROUP_ADDED", "GROUP_ARCHIVED"]),
    );
  });

  test("level names change while no group needs the level taken away; another program's group is not found", async () => {
    const id = await make({ levelLabels: ["Section", "Class"] });
    const top = (await add(id, "JSS 1")).json.data.id;
    const sub = (await add(id, "A", top)).json.data.id;
    const put = (labels: string[], program = id) => send(`${programUrl(program)}/levels`, "admin", "PUT", { labels });
    const taken = await put(["Section"]);
    expect(taken.status).toBe(409);
    expect(taken.json.error.code).toBe("LEVEL_IN_USE");
    expect((await put(["Year", "Form", "Stream"])).status).toBe(200);
    expect((await detail(id)).levelLabels).toEqual(["Year", "Form", "Stream"]);
    expect((await put(["Year", "Form", "Stream"])).status).toBe(200); // the same: nothing to do
    expect((await put(["a", "a"])).status).toBe(400);
    expect((await put([])).status).toBe(400);
    await send(`${programUrl(id)}/groups/${sub}`, "admin", "PATCH", { archived: true });
    expect((await put(["Year"])).status).toBe(409); // an archived group still holds its level: the history keeps its place
    const elsewhere = await make({});
    expect((await send(`${programUrl(elsewhere)}/groups/${top}`, "admin", "PATCH", { name: "Stolen" })).status).toBe(404);
    expect((await add(elsewhere, "Child", top)).status).toBe(404);
    expect((await send(`${programUrl(id)}/groups/${top}`, "admin", "PATCH", { name: "JSS 1", archived: true })).status).toBe(400); // exactly one thing at a time
  });
});

test.describe("campuses", () => {
  test("a campus is added to a program that runs in campuses and taken away unless it is the last or someone serves through it; a school-wide program is not narrowed", async () => {
    const id = await make({ campusIds: [north] });
    expect((await send(`${programUrl(id)}/campuses`, "admin", "POST", { campusId: south })).status).toBe(201);
    expect((await send(`${programUrl(id)}/campuses`, "admin", "POST", { campusId: south })).status).toBe(409);
    expect((await send(`${programUrl(id)}/campuses`, "admin", "POST", { campusId: "no-such-campus" })).status).toBe(404);
    expect((await send(`${programUrl(id)}/campuses`, "admin", "POST", { campusId: b.campuses[0]?.id ?? "x" })).status).toBe(404);
    // South's administrator now sees it
    expect((await get(programUrl(id), "campusSouth")).status).toBe(200);
    await send(`${programUrl(id)}/admins`, "admin", "POST", { userId: people.teacherSouth.id });
    const serving = await send(`${programUrl(id)}/campuses/${south}`, "admin", "DELETE");
    expect(serving.status).toBe(409);
    expect(serving.json.error.code).toBe("CAMPUS_IN_USE");
    expect((await send(`${programUrl(id)}/campuses/${north}`, "admin", "DELETE")).status).toBe(200);
    const last = await send(`${programUrl(id)}/campuses/${south}`, "admin", "DELETE");
    expect(last.status).toBe(409);
    expect(["CAMPUS_IN_USE", "LAST_CAMPUS"]).toContain(last.json.error.code);
    expect((await send(`${programUrl(id)}/campuses/${north}`, "admin", "DELETE")).status).toBe(404); // it no longer runs there
    const wide = await make({ campusIds: [] });
    const narrowed = await send(`${programUrl(wide)}/campuses`, "admin", "POST", { campusId: north });
    expect(narrowed.status).toBe(409);
    expect(narrowed.json.error.code).toBe("SCHOOL_WIDE");
  });
});

test.describe("the school's switch", () => {
  const setSchool = (enabled: boolean | null) =>
    send(`${school()}/settings/programs`, "admin", "PATCH", { scope: "SCHOOL", enabled, stepUp: proof("admin") });
  const setCampus = (who: string, campusId: string, enabled: boolean | null) =>
    send(`${school()}/settings/programs`, who, "PATCH", { scope: "CAMPUS", campusId, enabled });

  test("with programs off nothing can be made or changed, only the school's administrator still reads, and turning them on brings it all back", async () => {
    const id = await make({ campusIds: [north] });
    await send(`${programUrl(id)}/admins`, "admin", "POST", { userId: people.teacherNorth.id });
    expect((await send(`${school()}/settings/programs`, "admin", "PATCH", { scope: "SCHOOL", enabled: false })).status).toBe(400); // the fresh proof is required
    const off = await setSchool(false);
    expect(off.status, off.text).toBe(200);
    expect(off.json.data.school).toEqual({ stored: false, effective: false });
    const made = await send(programsUrl(), "admin", "POST", { name: "Blocked", kind: "ONGOING", campusIds: [north], levelLabels: LEVELS });
    expect(made.status).toBe(409);
    expect(made.json.error.code).toBe("PROGRAMS_OFF");
    expect((await send(programUrl(id), "admin", "PATCH", { name: "Changed while off" })).status).toBe(409);
    expect((await send(`${programUrl(id)}/groups`, "admin", "POST", { name: "G" })).status).toBe(409);
    const list = (await get(programsUrl(), "admin")).json.data;
    expect(list.enabled).toBe(false);
    expect(list.programs.length).toBeGreaterThan(0); // the school's administrator can still read
    expect((await get(programsUrl(), "teacherNorth")).json.data.programs).toEqual([]);
    expect((await get(programsUrl(), "campusNorth")).json.data.programs).toEqual([]);
    expect(await detail(id)).toMatchObject({ switchedOff: true, can: { editDetails: false, editStructure: false, administer: false } });
    expect((await setSchool(null)).status).toBe(200);
    expect((await send(programUrl(id), "admin", "PATCH", { name: uniq("Back on") })).status).toBe(200);
    expect((await get(programsUrl(), "teacherNorth")).json.data.programs.map((p: { id: string }) => p.id)).toContain(id);
  });

  test("a campus turns programs off for itself only, and never on over the school; a program cannot be made to run in a campus that has them off", async () => {
    expect((await setCampus("campusNorth", north, false)).status).toBe(200);
    expect((await setCampus("campusNorth", south, false)).status).toBe(404); // another campus answers like one that does not exist
    expect((await setCampus("teacherNorth", north, false)).status).toBe(403);
    const blocked = await send(programsUrl(), "admin", "POST", {
      name: uniq("Not in North"),
      kind: "ONGOING",
      campusIds: [north],
      levelLabels: LEVELS,
    });
    expect(blocked.status).toBe(409);
    expect(blocked.json.error.code).toBe("CAMPUS_PROGRAMS_OFF");
    const fine = await make({ campusIds: [south] });
    expect((await send(`${programUrl(fine)}/campuses`, "admin", "POST", { campusId: north })).status).toBe(409);
    expect((await setCampus("campusNorth", north, null)).status).toBe(200);
    expect((await send(`${programUrl(fine)}/campuses`, "admin", "POST", { campusId: north })).status).toBe(201);
    await setSchool(false);
    const widen = await setCampus("admin", north, true);
    expect(widen.status).toBe(400);
    expect(widen.json.error.message).toMatch(/only turn this off/);
    // who may change what, and a body that is not a switch
    expect(
      (
        await send(`${school()}/settings/programs`, "campusNorth", "PATCH", {
          scope: "SCHOOL",
          enabled: false,
          stepUp: proof("campusNorth"),
        })
      ).status,
    ).toBe(403);
    for (const body of [
      { scope: "SCHOOL", campusId: north, enabled: false, stepUp: proof("admin") },
      { scope: "CAMPUS", enabled: false },
      { scope: "EVERYONE", enabled: false },
      { enabled: false },
    ])
      expect((await send(`${school()}/settings/programs`, "admin", "PATCH", body)).status, JSON.stringify(body)).toBe(400);
    const view = (await get(`${school()}/settings/programs`, "campusNorth")).json.data;
    expect(view.canEditSchool).toBe(false);
    expect(view.campuses.map((c: { name: string }) => c.name)).toEqual(["North"]);
  });
});

test.describe("another school", () => {
  test("a program, its groups and its audit are the school's own: another school's administrator neither sees nor reaches them, and a campus id is not carried across", async () => {
    const id = await make({});
    const group = (await send(`${programUrl(id)}/groups`, "admin", "POST", { name: "Mine" })).json.data.id;
    for (const [url, method, body] of [
      [programUrl(id, b.code), "GET", undefined],
      [programUrl(id, b.code), "PATCH", { name: "Taken" }],
      [`${programUrl(id, b.code)}/status`, "POST", { action: "archive" }],
      [`${programUrl(id, b.code)}/groups/${group}`, "PATCH", { name: "Taken" }],
      [`${programUrl(id, b.code)}/groups`, "POST", { name: "Planted" }],
    ] as const) {
      const res = await api(url, { ...as("adminB"), method, ...(body ? { body } : {}) });
      expect([403, 404], `${method} ${url}`).toContain(res.status);
    }
    expect((await get(programsUrl(b.code), "adminB")).json.data.programs).toEqual([]);
    expect(await db.programGroup.count({ where: { tenantId: b.id } })).toBe(0);
    expect((await detail(id)).name).not.toBe("Taken");
  });
});
