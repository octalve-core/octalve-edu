// --- Pure Higher-Ed Domain Rules (Phase 5) ---
import { CourseRegStatus } from "@prisma/client";

export interface GradeMapping {
  grade: string;
  gradePoint: number;
}

/**
 * Standard 5.0 Grade Point System (Commonwealth / Nigerian University Commission benchmark).
 * 70 - 100 => A (5.0)
 * 60 - 69  => B (4.0)
 * 50 - 59  => C (3.0)
 * 45 - 49  => D (2.0)
 * 40 - 44  => E (1.0)
 * 0  - 39  => F (0.0)
 */
export function scoreToGradePoint(score: number): GradeMapping {
  if (score < 0 || score > 100 || !Number.isFinite(score)) {
    throw new Error(`Score must be between 0 and 100 (got ${score})`);
  }

  if (score >= 70) return { grade: "A", gradePoint: 5.0 };
  if (score >= 60) return { grade: "B", gradePoint: 4.0 };
  if (score >= 50) return { grade: "C", gradePoint: 3.0 };
  if (score >= 45) return { grade: "D", gradePoint: 2.0 };
  if (score >= 40) return { grade: "E", gradePoint: 1.0 };
  return { grade: "F", gradePoint: 0.0 };
}

export interface GpaItem {
  creditUnits: number;
  gradePoint: number | null;
  status: CourseRegStatus;
}

export interface GpaResult {
  totalCredits: number;
  totalQualityPoints: number;
  gpa: number;
}

/**
 * Calculates semester GPA or cumulative CGPA.
 * Only COMPLETED courses with a defined gradePoint contribute to quality points.
 */
export function calculateGPA(courses: GpaItem[]): GpaResult {
  let totalCredits = 0;
  let totalQualityPoints = 0;

  for (const item of courses) {
    if (item.status === CourseRegStatus.COMPLETED && item.gradePoint !== null && Number.isFinite(item.gradePoint)) {
      totalCredits += item.creditUnits;
      totalQualityPoints += item.creditUnits * item.gradePoint;
    }
  }

  const gpa = totalCredits > 0 ? Math.round((totalQualityPoints / totalCredits) * 100) / 100 : 0.0;

  return {
    totalCredits,
    totalQualityPoints: Math.round(totalQualityPoints * 100) / 100,
    gpa,
  };
}

export const MIN_SEMESTER_CREDITS = 12;
export const MAX_SEMESTER_CREDITS = 24;

export function validateSemesterCourseLoad(totalCredits: number): { valid: boolean; error?: string } {
  if (totalCredits < MIN_SEMESTER_CREDITS) {
    return {
      valid: false,
      error: `Minimum registered credits per semester is ${MIN_SEMESTER_CREDITS} (attempted ${totalCredits})`,
    };
  }
  if (totalCredits > MAX_SEMESTER_CREDITS) {
    return {
      valid: false,
      error: `Maximum registered credits per semester is ${MAX_SEMESTER_CREDITS} (attempted ${totalCredits})`,
    };
  }
  return { valid: true };
}

export function isValidHigherEdLevel(level: number): boolean {
  return [100, 200, 300, 400, 500].includes(level);
}

export function isValidSemester(semester: number): boolean {
  return semester === 1 || semester === 2;
}
