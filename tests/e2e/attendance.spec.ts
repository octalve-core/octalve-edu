import { test, expect } from "../support/fixtures";
import { Role, addMembership, createTenant, createUser, db, removeCreatedTenants, seedInstance, type TestTenant } from "../support/db";
import { SAAS_URL } from "../support/env";
import { signInThroughUi } from "./helpers";

test.use({ baseURL: SAAS_URL });

let school: TestTenant;

test.beforeAll(async () => {
  await seedInstance();
});

test.afterAll(async () => {
  await removeCreatedTenants();
});

test.beforeEach(async () => {
  school = await createTenant({ name: "Bright Stars Academy" });
});

test.afterEach(async () => {
  await removeCreatedTenants();
});

test.describe("Attendance Screen", () => {
  test("renders attendance panel, switches status, and saves roll call", async ({ page }) => {
    // 1. Setup session, class group, arm, and enrolled student in DB
    const admin = await createUser({ name: "Amina Yusuf" });
    await addMembership(admin.id, school.id, Role.ADMIN);

    const session = await db.academicSession.create({
      data: {
        tenantId: school.id,
        label: "2026/2027",
        startDate: new Date("2026-09-01T00:00:00Z"),
        endDate: new Date("2027-07-20T00:00:00Z"),
        status: "ACTIVE",
      },
    });

    const classGroup = await db.classGroup.create({
      data: {
        tenantId: school.id,
        name: "Primary 1",
        sortOrder: 1,
      },
    });

    const arm = await db.classArm.create({
      data: {
        tenantId: school.id,
        classGroupId: classGroup.id,
        name: "Diamond",
      },
    });

    const student = await db.studentRecord.create({
      data: {
        tenantId: school.id,
        admissionNo: "BSA-2026-001",
        firstName: "Fatima",
        lastName: "Aliyu",
        dateOfBirth: new Date("2019-03-15T00:00:00Z"),
      },
    });

    await db.studentEnrollment.create({
      data: {
        tenantId: school.id,
        studentId: student.id,
        sessionId: session.id,
        classArmId: arm.id,
        status: "ACTIVE",
      },
    });

    // 2. Sign in and navigate to attendance section
    await signInThroughUi(page, admin);
    await page.goto(`/schools/${school.code}/academics?section=attendance`);

    await expect(page.getByRole("heading", { level: 2, name: "Daily Attendance" })).toBeVisible();
    await expect(page.getByText("Aliyu, Fatima")).toBeVisible();
    await expect(page.getByText("Admission: BSA-2026-001")).toBeVisible();

    // 3. Mark All Present action
    const markAllBtn = page.getByRole("button", { name: "Mark All Present" });
    await expect(markAllBtn).toBeVisible();
    await markAllBtn.click();

    // 4. Toggle specific status (e.g. LATE)
    const lateBtn = page.getByRole("button", { name: "LATE" });
    await expect(lateBtn).toBeVisible();
    await lateBtn.click();

    // 5. Save attendance
    const saveBtn = page.getByRole("button", { name: "Save Roll Call" }).first();
    await expect(saveBtn).toBeVisible();
    await saveBtn.click();

    // 6. Expect success notification
    await expect(page.getByText(/Attendance saved for/)).toBeVisible();
  });

  test("a teacher is offered only the arms they are assigned to; one with no assignment is told why (ISS-0013)", async ({ page }) => {
    const session = await db.academicSession.create({
      data: {
        tenantId: school.id,
        label: "2026/2027",
        startDate: new Date("2026-09-01"),
        endDate: new Date("2027-07-20"),
        status: "ACTIVE",
      },
    });
    const group = await db.classGroup.create({ data: { tenantId: school.id, name: "Primary 1", sortOrder: 1 } });
    const [mine, notMine] = await Promise.all([
      db.classArm.create({ data: { tenantId: school.id, classGroupId: group.id, name: "Diamond" } }),
      db.classArm.create({ data: { tenantId: school.id, classGroupId: group.id, name: "Ruby" } }),
    ]);
    expect(session.id).toBeTruthy();
    const subject = await db.subject.create({ data: { tenantId: school.id, name: "English", code: "ENGE2E" } });
    const teacher = await createUser({ name: "Tola Teacher" });
    await addMembership(teacher.id, school.id, Role.TEACHING_STAFF);
    const staff = await db.staffRecord.create({
      data: { tenantId: school.id, userId: teacher.id, category: "TEACHING", firstName: "Tola", lastName: "Teacher" },
    });
    await db.staffSubjectAssignment.create({
      data: { tenantId: school.id, staffRecordId: staff.id, subjectId: subject.id, classArmId: mine.id },
    });
    expect(notMine.id).toBeTruthy();

    await signInThroughUi(page, teacher);
    await page.goto(`/schools/${school.code}/academics?section=attendance`);
    const options = page.getByLabel("Class Arm").locator("option");
    await expect(options).toHaveText(["Primary 1 — Diamond"]);

    // a teacher with nothing assigned is told what to do, not shown an empty mystery
    const idle = await createUser({ name: "Idle Teacher" });
    await addMembership(idle.id, school.id, Role.TEACHING_STAFF);
    await page.context().clearCookies();
    await signInThroughUi(page, idle);
    await page.goto(`/schools/${school.code}/academics?section=attendance`);
    await expect(page.getByText("No class arms are assigned to you")).toBeVisible();
  });

  for (const who of ["teacher", "campus administrator"] as const) {
    test(`a ${who} takes the roll of their arm from the screen and saves it (the screen used to be read-only for everyone but a school administrator)`, async ({
      page,
    }) => {
      const north = school.campuses[0].id;
      await db.academicSession.create({
        data: {
          tenantId: school.id,
          label: "2026/2027",
          startDate: new Date("2026-09-01"),
          endDate: new Date("2027-07-20"),
          status: "ACTIVE",
        },
      });
      const group = await db.classGroup.create({ data: { tenantId: school.id, campusId: north, name: "Primary 1", sortOrder: 1 } });
      const arm = await db.classArm.create({ data: { tenantId: school.id, classGroupId: group.id, name: "Diamond" } });
      const session = await db.academicSession.findFirstOrThrow({ where: { tenantId: school.id } });
      const pupil = await db.studentRecord.create({
        data: {
          tenantId: school.id,
          campusId: north,
          admissionNo: "ROLL-1",
          firstName: "Fatima",
          lastName: "Aliyu",
          dateOfBirth: new Date("2019-03-15"),
        },
      });
      await db.studentEnrollment.create({
        data: { tenantId: school.id, studentId: pupil.id, sessionId: session.id, classArmId: arm.id, status: "ACTIVE" },
      });
      const person = await createUser({ name: "Roll Taker" });
      if (who === "teacher") {
        await addMembership(person.id, school.id, Role.TEACHING_STAFF, north);
        const subject = await db.subject.create({ data: { tenantId: school.id, name: "English", code: "ENGRC" } });
        const staff = await db.staffRecord.create({
          data: { tenantId: school.id, campusId: north, userId: person.id, category: "TEACHING", firstName: "Roll", lastName: "Taker" },
        });
        await db.staffSubjectAssignment.create({
          data: { tenantId: school.id, staffRecordId: staff.id, subjectId: subject.id, classArmId: arm.id },
        });
      } else {
        await addMembership(person.id, school.id, Role.CAMPUS_ADMIN, north);
      }

      await signInThroughUi(page, person);
      await page.goto(`/schools/${school.code}/academics?section=attendance`);
      // the page must not tell someone who CAN take the roll that only an administrator can change things
      await expect(page.getByText("Only an administrator can change this.")).toHaveCount(0);
      await expect(page.getByText("Aliyu, Fatima")).toBeVisible();
      await page.getByRole("button", { name: "Mark All Present" }).click();
      await page.getByRole("button", { name: "Save Roll Call" }).first().click();
      await expect(page.getByText(/Attendance saved for/)).toBeVisible();
      expect(await db.attendanceRecord.count({ where: { tenantId: school.id, studentId: pupil.id, status: "PRESENT" } })).toBe(1);
    });
  }
});
