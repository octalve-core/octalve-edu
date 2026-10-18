// --- Higher-Ed Service (Phase 5) ---
import { CourseRegStatus, Prisma } from "@prisma/client";
import { forTenant } from "@/lib/tenant/for-tenant";
import { trustedTenantId } from "@/lib/tenant/verified-tenant";
import { calculateGPA, scoreToGradePoint, validateSemesterCourseLoad, isValidHigherEdLevel, isValidSemester } from "./rules";

export async function listDepartments(tenantId: string) {
  const tId = trustedTenantId(tenantId);
  return forTenant(tId).transaction(async (tx) => {
    return tx.department.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
      include: {
        _count: { select: { courses: true } },
      },
    });
  });
}

export async function createDepartment(tenantId: string, data: { name: string; code: string }) {
  const tId = trustedTenantId(tenantId);
  const code = data.code.trim().toUpperCase();
  const name = data.name.trim();

  return forTenant(tId).transaction(async (tx) => {
    return tx.department.create({
      data: {
        tenantId,
        name,
        code,
      },
    });
  });
}

export async function listCourses(
  tenantId: string,
  filters: {
    departmentId?: string;
    level?: number;
    semester?: number;
  } = {},
) {
  const tId = trustedTenantId(tenantId);
  return forTenant(tId).transaction(async (tx) => {
    const where: Prisma.CourseWhereInput = { tenantId };
    if (filters.departmentId) where.departmentId = filters.departmentId;
    if (filters.level) where.level = filters.level;
    if (filters.semester) where.semester = filters.semester;

    return tx.course.findMany({
      where,
      orderBy: [{ level: "asc" }, { code: "asc" }],
      include: {
        department: { select: { id: true, name: true, code: true } },
        _count: { select: { registrations: true } },
      },
    });
  });
}

export async function createCourse(
  tenantId: string,
  data: {
    departmentId: string;
    code: string;
    title: string;
    creditUnits: number;
    level: number;
    semester: number;
    description?: string;
  },
) {
  const tId = trustedTenantId(tenantId);
  if (!isValidHigherEdLevel(data.level)) {
    throw new Error(`Invalid academic level: ${data.level}. Must be 100, 200, 300, 400, or 500.`);
  }
  if (!isValidSemester(data.semester)) {
    throw new Error(`Invalid semester: ${data.semester}. Must be 1 or 2.`);
  }

  return forTenant(tId).transaction(async (tx) => {
    return tx.course.create({
      data: {
        tenantId,
        departmentId: data.departmentId,
        code: data.code.trim().toUpperCase(),
        title: data.title.trim(),
        creditUnits: data.creditUnits,
        level: data.level,
        semester: data.semester,
        description: data.description?.trim() || null,
      },
      include: {
        department: { select: { id: true, name: true, code: true } },
      },
    });
  });
}

export async function registerStudentCourse(
  tenantId: string,
  data: {
    studentId: string;
    courseId: string;
    periodId: string;
  },
) {
  const tId = trustedTenantId(tenantId);
  return forTenant(tId).transaction(async (tx) => {
    const course = await tx.course.findUniqueOrThrow({
      where: { id: data.courseId },
      select: { creditUnits: true },
    });

    return tx.courseRegistration.create({
      data: {
        tenantId,
        studentId: data.studentId,
        courseId: data.courseId,
        periodId: data.periodId,
        creditUnits: course.creditUnits,
        status: CourseRegStatus.REGISTERED,
      },
      include: {
        course: { select: { code: true, title: true, creditUnits: true } },
        student: { select: { id: true, firstName: true, lastName: true, admissionNo: true } },
      },
    });
  });
}

export async function gradeStudentCourse(
  tenantId: string,
  data: {
    registrationId: string;
    score: number;
  },
) {
  const tId = trustedTenantId(tenantId);
  const { grade, gradePoint } = scoreToGradePoint(data.score);

  return forTenant(tId).transaction(async (tx) => {
    return tx.courseRegistration.update({
      where: { id: data.registrationId },
      data: {
        score: new Prisma.Decimal(data.score),
        grade,
        gradePoint: new Prisma.Decimal(gradePoint),
        status: CourseRegStatus.COMPLETED,
      },
      include: {
        course: { select: { code: true, title: true, creditUnits: true } },
        student: { select: { id: true, firstName: true, lastName: true, admissionNo: true } },
      },
    });
  });
}

export async function getStudentTranscript(tenantId: string, studentId: string) {
  const tId = trustedTenantId(tenantId);
  return forTenant(tId).transaction(async (tx) => {
    const registrations = await tx.courseRegistration.findMany({
      where: { tenantId, studentId },
      orderBy: [{ period: { startDate: "asc" } }, { course: { code: "asc" } }],
      include: {
        course: { select: { code: true, title: true, creditUnits: true, level: true, semester: true } },
        period: { select: { id: true, label: true, startDate: true, endDate: true } },
      },
    });

    const gpaItems = registrations.map((r) => ({
      creditUnits: r.creditUnits,
      gradePoint: r.gradePoint ? Number(r.gradePoint) : null,
      status: r.status,
    }));

    const cgpa = calculateGPA(gpaItems);

    return {
      registrations,
      summary: cgpa,
    };
  });
}
