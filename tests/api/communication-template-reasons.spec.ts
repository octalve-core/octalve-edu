import "../support/env";
import { test, expect } from "@playwright/test";
import { NotificationChannel, Role } from "@prisma/client";
import { SAAS_URL } from "../support/env";
import { member, type Person } from "../support/qbank-world";
import { createTenant, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { api } from "../support/http";

// Task 0070: the template routes refuse a name or a subject that is too short or too long with a reason a person can act on, in the route's `details` (the Customize dialog shows the first one). Before,
// the reason was zod's default text for a minimum length, which is not a sentence for a school administrator, and the dialog showed only "Some of the fields are not valid."

test.describe.configure({ timeout: 120_000 });

const tag = `T${Date.now().toString(36).toUpperCase()}`;
let school: TestTenant;
let admin: Person;
let templateId: string;

test.beforeAll(async () => {
  await seedInstance();
  school = await createTenant({ name: `${tag} Template School` });
  admin = await member(school, Role.ADMIN, null, `${tag} Admin`);
  const created = await api(`/api/v1/schools/${school.code}/communication/templates`, {
    method: "POST",
    baseUrl: SAAS_URL,
    cookie: admin.cookie,
    body: {
      code: `REASONS_${tag}`,
      name: "A fine name",
      channel: NotificationChannel.EMAIL,
      subjectTemplate: "Hello",
      bodyTemplate: "Hello {{school_name}}.",
    },
  });
  expect(created.status).toBe(201);
  templateId = created.json.data.id;
});
test.afterAll(async () => {
  await removeCreatedTenants();
});

const update = (body: Record<string, unknown>) =>
  api(`/api/v1/schools/${school.code}/communication/templates/${templateId}`, {
    method: "PATCH",
    baseUrl: SAAS_URL,
    cookie: admin.cookie,
    body,
  });
const create = (body: Record<string, unknown>) =>
  api(`/api/v1/schools/${school.code}/communication/templates`, {
    method: "POST",
    baseUrl: SAAS_URL,
    cookie: admin.cookie,
    body: { code: `MORE_${tag}`, channel: NotificationChannel.SMS, bodyTemplate: "Hello.", ...body },
  });
const first = (res: { json: { error: { details: { path: string; message: string }[] } } }) => res.json.error.details[0];

test("a template name that is too short is refused with a sentence that says what to change", async () => {
  const res = await update({ name: "A" });
  expect(res.status).toBe(400);
  expect(first(res)).toEqual({ path: "body.name", message: "Give the template a name of at least 2 characters." });
});

test("a template name that is too long is refused with a sentence that says what to change", async () => {
  const res = await update({ name: "N".repeat(101) });
  expect(res.status).toBe(400);
  expect(first(res)).toEqual({ path: "body.name", message: "Keep the template name to 100 characters or fewer." });
});

test("a subject that is too long is refused with a sentence that says what to change", async () => {
  const res = await update({ subjectTemplate: "S".repeat(256) });
  expect(res.status).toBe(400);
  expect(first(res)).toEqual({ path: "body.subjectTemplate", message: "Keep the subject to 255 characters or fewer." });
});

test("the route that makes a template gives the same reasons", async () => {
  const short = await create({ name: "A" });
  expect(short.status).toBe(400);
  expect(first(short)).toEqual({ path: "body.name", message: "Give the template a name of at least 2 characters." });
  const long = await create({ name: "N".repeat(101) });
  expect(long.status).toBe(400);
  expect(first(long)).toEqual({ path: "body.name", message: "Keep the template name to 100 characters or fewer." });
});

test("a valid name is still accepted and kept", async () => {
  const res = await update({ name: "Absence notice to parents" });
  expect(res.status).toBe(200);
  expect(res.json.data.name).toBe("Absence notice to parents");
});
