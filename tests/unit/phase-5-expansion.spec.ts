import "../support/env";
import { test, expect } from "@playwright/test";
import { CourseRegStatus } from "@prisma/client";
import { scoreToGradePoint, calculateGPA, validateSemesterCourseLoad, isValidHigherEdLevel, isValidSemester } from "@/lib/higher-ed/rules";
import {
  validateCustomDomain,
  generateDomainVerificationToken,
  getDnsVerificationInstructions,
  RESERVED_SUBDOMAINS,
} from "@/lib/domains/rules";
import { computeCertificateHash, formatCertificateNumber, verifyCertificateIntegrity } from "@/lib/certificates/rules";

test.describe("Phase 5 — Higher-Ed Domain Rules", () => {
  test("scoreToGradePoint correctly maps 5.0 scale boundaries", () => {
    expect(scoreToGradePoint(100)).toEqual({ grade: "A", gradePoint: 5.0 });
    expect(scoreToGradePoint(70)).toEqual({ grade: "A", gradePoint: 5.0 });
    expect(scoreToGradePoint(69.9)).toEqual({ grade: "B", gradePoint: 4.0 });
    expect(scoreToGradePoint(60)).toEqual({ grade: "B", gradePoint: 4.0 });
    expect(scoreToGradePoint(59.9)).toEqual({ grade: "C", gradePoint: 3.0 });
    expect(scoreToGradePoint(50)).toEqual({ grade: "C", gradePoint: 3.0 });
    expect(scoreToGradePoint(49.9)).toEqual({ grade: "D", gradePoint: 2.0 });
    expect(scoreToGradePoint(45)).toEqual({ grade: "D", gradePoint: 2.0 });
    expect(scoreToGradePoint(44.9)).toEqual({ grade: "E", gradePoint: 1.0 });
    expect(scoreToGradePoint(40)).toEqual({ grade: "E", gradePoint: 1.0 });
    expect(scoreToGradePoint(39.9)).toEqual({ grade: "F", gradePoint: 0.0 });
    expect(scoreToGradePoint(0)).toEqual({ grade: "F", gradePoint: 0.0 });

    expect(() => scoreToGradePoint(-1)).toThrow();
    expect(() => scoreToGradePoint(101)).toThrow();
  });

  test("calculateGPA correctly weighs credit units and computes GPA", () => {
    const courses = [
      { creditUnits: 3, gradePoint: 5.0, status: CourseRegStatus.COMPLETED }, // 15
      { creditUnits: 3, gradePoint: 4.0, status: CourseRegStatus.COMPLETED }, // 12
      { creditUnits: 2, gradePoint: 3.0, status: CourseRegStatus.COMPLETED }, // 6
      { creditUnits: 4, gradePoint: 0.0, status: CourseRegStatus.COMPLETED }, // 0
      { creditUnits: 3, gradePoint: null, status: CourseRegStatus.REGISTERED }, // excluded
      { creditUnits: 3, gradePoint: 5.0, status: CourseRegStatus.DROPPED }, // excluded
    ];
    // Completed credits = 3 + 3 + 2 + 4 = 12
    // Quality points = 15 + 12 + 6 + 0 = 33
    // GPA = 33 / 12 = 2.75
    const result = calculateGPA(courses);
    expect(result.totalCredits).toBe(12);
    expect(result.totalQualityPoints).toBe(33);
    expect(result.gpa).toBe(2.75);
  });

  test("calculateGPA handles empty courses safely", () => {
    const result = calculateGPA([]);
    expect(result.totalCredits).toBe(0);
    expect(result.totalQualityPoints).toBe(0);
    expect(result.gpa).toBe(0.0);
  });

  test("validateSemesterCourseLoad enforces minimum and maximum boundaries", () => {
    expect(validateSemesterCourseLoad(11).valid).toBe(false);
    expect(validateSemesterCourseLoad(12).valid).toBe(true);
    expect(validateSemesterCourseLoad(18).valid).toBe(true);
    expect(validateSemesterCourseLoad(24).valid).toBe(true);
    expect(validateSemesterCourseLoad(25).valid).toBe(false);
  });

  test("isValidHigherEdLevel and isValidSemester enforce tertiary levels", () => {
    expect(isValidHigherEdLevel(100)).toBe(true);
    expect(isValidHigherEdLevel(400)).toBe(true);
    expect(isValidHigherEdLevel(600)).toBe(false);
    expect(isValidHigherEdLevel(10)).toBe(false);

    expect(isValidSemester(1)).toBe(true);
    expect(isValidSemester(2)).toBe(true);
    expect(isValidSemester(3)).toBe(false);
  });
});

test.describe("Phase 5 — Custom Domain Rules", () => {
  test("validateCustomDomain accepts valid FQDNs", () => {
    const res1 = validateCustomDomain("portal.myschool.edu.ng");
    expect(res1.valid).toBe(true);
    expect(res1.normalized).toBe("portal.myschool.edu.ng");

    const res2 = validateCustomDomain("academics.city-college.org");
    expect(res2.valid).toBe(true);
    expect(res2.normalized).toBe("academics.city-college.org");
  });

  test("validateCustomDomain rejects invalid hosts and protocols", () => {
    expect(validateCustomDomain("https://school.edu").valid).toBe(false);
    expect(validateCustomDomain("school.edu/portal").valid).toBe(false);
    expect(validateCustomDomain("school:8080").valid).toBe(false);
    expect(validateCustomDomain("localhost").valid).toBe(false);
    expect(validateCustomDomain("").valid).toBe(false);
    expect(validateCustomDomain("a..b.com").valid).toBe(false);
  });

  test("validateCustomDomain blocks reserved platform subdomains", () => {
    for (const sub of Array.from(RESERVED_SUBDOMAINS)) {
      const res = validateCustomDomain(`${sub}.octalve-school.com`);
      expect(res.valid).toBe(false);
      expect(res.error).toContain("reserved");
    }
  });

  test("generateDomainVerificationToken produces secure prefixed tokens", () => {
    const t1 = generateDomainVerificationToken();
    const t2 = generateDomainVerificationToken();
    expect(t1.startsWith("octalve-domain-verify-")).toBe(true);
    expect(t1).not.toBe(t2);
  });

  test("getDnsVerificationInstructions yields TXT and CNAME records", () => {
    const instructions = getDnsVerificationInstructions("portal.myschool.edu", "token-12345");
    expect(instructions.length).toBe(2);
    expect(instructions[0].type).toBe("TXT");
    expect(instructions[0].host).toBe("_octalve-challenge.portal.myschool.edu");
    expect(instructions[0].value).toBe("token-12345");
    expect(instructions[1].type).toBe("CNAME");
    expect(instructions[1].host).toBe("portal.myschool.edu");
    expect(instructions[1].value).toBe("cname.octalve.com");
  });
});

test.describe("Phase 5 — Vocational Certification Rules", () => {
  test("computeCertificateHash is deterministic and tamper-evident", () => {
    const input = {
      tenantId: "tenant_abc123",
      studentId: "student_xyz789",
      certificateNo: "OCT-VOC-2026-00001",
      title: "Certificate in Automotive Mechatronics",
      issueDate: new Date("2026-10-18T00:00:00Z"),
    };

    const hash1 = computeCertificateHash(input);
    const hash2 = computeCertificateHash(input);
    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64); // SHA-256 hex string

    // Any tamper changes hash
    const tampered = { ...input, title: "Certificate in Automotive Mechatronics (Modified)" };
    expect(computeCertificateHash(tampered)).not.toBe(hash1);
  });

  test("formatCertificateNumber formats standardized serials", () => {
    expect(formatCertificateNumber("OCT", 2026, 1)).toBe("OCT-VOC-2026-00001");
    expect(formatCertificateNumber("tech", 2026, 42)).toBe("TECH-VOC-2026-00042");
    expect(formatCertificateNumber("A&B", 2026, 999)).toBe("AB-VOC-2026-00999");
  });

  test("verifyCertificateIntegrity detects altered data accurately", () => {
    const input = {
      tenantId: "tenant_abc123",
      studentId: "student_xyz789",
      certificateNo: "OCT-VOC-2026-00001",
      title: "Certificate in Solar Energy Installation",
      issueDate: "2026-10-18T10:00:00.000Z",
    };
    const validHash = computeCertificateHash(input);

    expect(verifyCertificateIntegrity(input, validHash)).toBe(true);
    expect(verifyCertificateIntegrity({ ...input, certificateNo: "OCT-VOC-2026-00002" }, validHash)).toBe(false);
  });
});
