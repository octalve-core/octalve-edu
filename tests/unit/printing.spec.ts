import { test, expect } from "@playwright/test";
import { Role } from "@prisma/client";
import {
  isNearExamWindow,
  canPrintTarget,
  canPupilPrintAttempt,
  generateWatermarkText,
  generateExamPdf,
  escapePdfText,
  wrapText,
} from "@/lib/question-bank/printing";

test.describe("Printing Domain Rules & PDF Engine (Task 0032 Slice 10)", () => {
  test.describe("isNearExamWindow", () => {
    const examStart = new Date("2026-11-15T09:00:00Z");
    const examEnd = new Date("2026-11-15T12:00:00Z");

    test("returns false when examWindowStart is missing or null", () => {
      expect(isNearExamWindow({})).toBe(false);
      expect(isNearExamWindow({ examWindowStart: null })).toBe(false);
    });

    test("returns true during near-exam window (default 7 days prior)", () => {
      // 5 days prior
      const now = new Date("2026-11-10T10:00:00Z");
      expect(isNearExamWindow({ examWindowStart: examStart, examWindowEnd: examEnd }, now)).toBe(true);
    });

    test("returns true during active exam sitting", () => {
      const now = new Date("2026-11-15T10:30:00Z");
      expect(isNearExamWindow({ examWindowStart: examStart, examWindowEnd: examEnd }, now)).toBe(true);
    });

    test("returns false before near-exam window (> 7 days prior)", () => {
      // 10 days prior
      const now = new Date("2026-11-05T09:00:00Z");
      expect(isNearExamWindow({ examWindowStart: examStart, examWindowEnd: examEnd }, now)).toBe(false);
    });

    test("returns false after exam window has concluded", () => {
      // 1 hour after exam end
      const now = new Date("2026-11-15T13:00:00Z");
      expect(isNearExamWindow({ examWindowStart: examStart, examWindowEnd: examEnd }, now)).toBe(false);
    });

    test("respects custom nearExamDays setting (e.g. 14 days)", () => {
      const now = new Date("2026-11-03T09:00:00Z"); // 12 days prior
      expect(isNearExamWindow({ examWindowStart: examStart, examWindowEnd: examEnd, nearExamDays: 14 }, now)).toBe(true);
      expect(isNearExamWindow({ examWindowStart: examStart, examWindowEnd: examEnd, nearExamDays: 7 }, now)).toBe(false);
    });
  });

  test.describe("canPrintTarget permissions", () => {
    const teacherViewer = {
      userId: "teacher-1",
      role: Role.TEACHING_STAFF,
      isSuperAdmin: false,
      isExamApprover: false,
    };

    const approverViewer = {
      userId: "approver-1",
      role: Role.TEACHING_STAFF,
      isSuperAdmin: false,
      isExamApprover: true,
    };

    const adminViewer = {
      userId: "admin-1",
      role: Role.ADMIN,
      isSuperAdmin: false,
      isExamApprover: false,
    };

    const superAdminViewer = {
      userId: "super-1",
      role: Role.ADMIN,
      isSuperAdmin: true,
      isExamApprover: false,
    };

    const examTarget = {
      isExam: true,
      examWindowStart: new Date("2026-11-15T09:00:00Z"),
      examWindowEnd: new Date("2026-11-15T12:00:00Z"),
    };

    const inWindowNow = new Date("2026-11-12T09:00:00Z"); // 3 days before exam

    test("blocks standard teacher from printing exam within near-exam window", () => {
      const result = canPrintTarget(examTarget, teacherViewer, 7, inWindowNow);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("restricted to exam approvers and administrators");
    });

    test("allows exam approver to print exam within near-exam window (audited)", () => {
      const result = canPrintTarget(examTarget, approverViewer, 7, inWindowNow);
      expect(result.allowed).toBe(true);
    });

    test("allows branch admin to print exam within near-exam window", () => {
      const result = canPrintTarget(examTarget, adminViewer, 7, inWindowNow);
      expect(result.allowed).toBe(true);
    });

    test("allows superadmin to print exam anytime", () => {
      const result = canPrintTarget(examTarget, superAdminViewer, 7, inWindowNow);
      expect(result.allowed).toBe(true);
    });

    test("allows standard teacher to print exam well outside near-exam window", () => {
      const wayBeforeNow = new Date("2026-10-01T09:00:00Z");
      const result = canPrintTarget(examTarget, teacherViewer, 7, wayBeforeNow);
      expect(result.allowed).toBe(true);
    });

    test("allows standard teacher to print non-exam materials (practice sets, questionnaires, paper work)", () => {
      const nonExamTarget = { isExam: false };
      const result = canPrintTarget(nonExamTarget, teacherViewer, 7, inWindowNow);
      expect(result.allowed).toBe(true);
    });
  });

  test.describe("canPupilPrintAttempt", () => {
    test("refuses pupil printing on in-progress practice session", () => {
      const result = canPupilPrintAttempt({ finishedAt: null });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("only print completed practice sessions");
    });

    test("permits pupil printing on completed practice session", () => {
      const result = canPupilPrintAttempt({ finishedAt: new Date("2026-10-28T09:30:00Z") });
      expect(result.allowed).toBe(true);
    });

    test("refuses pupil printing on in-progress form response", () => {
      const result = canPupilPrintAttempt({ status: "IN_PROGRESS" });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("only print completed submissions");
    });

    test("permits pupil printing on completed form response", () => {
      const result = canPupilPrintAttempt({ status: "COMPLETED" });
      expect(result.allowed).toBe(true);
    });
  });

  test.describe("generateWatermarkText", () => {
    test("formats standard staff audit watermark", () => {
      const wm = generateWatermarkText({
        actorName: "Ustaz Ibrahim",
        actorIdentifier: "ibrahim@aleemaan.sch.ng",
        branchName: "Secondary English",
        targetTitle: "Physics Midterm Exam",
        timestamp: new Date("2026-11-15T08:30:00Z"),
      });

      expect(wm).toContain("Ustaz Ibrahim");
      expect(wm).toContain("ibrahim@aleemaan.sch.ng");
      expect(wm).toContain("Physics Midterm Exam");
      expect(wm).toContain("2026-11-15 08:30:00 UTC");
      expect(wm).toContain("Secondary English");
    });

    test("formats pupil handout release watermark with recipient details", () => {
      const wm = generateWatermarkText({
        actorName: "Mr. Sulaiman",
        actorIdentifier: "sulaiman@aleemaan.sch.ng",
        targetTitle: "Calculus Problem Sheet",
        timestamp: new Date("2026-11-15T08:30:00Z"),
        recipientStudentName: "Amina Yusuf",
        recipientStudentAdmissionNo: "2026/0142",
      });

      expect(wm).toContain("ISSUED BY: Mr. Sulaiman");
      expect(wm).toContain("HANDOUT FOR: Amina Yusuf (2026/0142)");
      expect(wm).toContain("2026-11-15 08:30:00 UTC");
    });
  });

  test.describe("escapePdfText & wrapText", () => {
    test("escapes parentheses and backslashes in PDF text", () => {
      const text = "Calculate (x + y) \\ z";
      expect(escapePdfText(text)).toBe("Calculate \\(x + y\\) \\\\ z");
    });

    test("wraps text within character bounds", () => {
      const longText = "The quick brown fox jumps over the lazy dog and runs across the wide green fields of the school.";
      const lines = wrapText(longText, 30);
      expect(lines.length).toBeGreaterThan(1);
      for (const line of lines) {
        expect(line.length).toBeLessThanOrEqual(30);
      }
    });
  });

  test.describe("generateExamPdf generator", () => {
    test("generates valid PDF-1.4 binary buffer with header, trailer, and watermark", () => {
      const doc = {
        title: "Agricultural Science Exam",
        branchName: "Secondary English",
        watermark: "TEACHER: Abdullah • 2026-11-15 08:00:00 UTC • CONFIDENTIAL",
        date: "2026-11-15",
        instructions: "Answer all questions. Read instructions carefully.",
        totalPoints: 20,
        classGroupName: "JSS 2",
        questions: [
          {
            prompt: "What is the primary role of nitrogen in plant growth?",
            questionType: "SINGLE",
            points: 5,
            options: ["Root growth", "Leaf and stem greening", "Fruit ripening", "Seed dormancy"],
            correctAnswer: "Leaf and stem greening",
            explanation: "Nitrogen is a key constituent of chlorophyll.",
          },
          {
            prompt: "Explain crop rotation and give two benefits.",
            questionType: "SHORT",
            points: 15,
            studentAnswer: "Crop rotation means planting different crops in sequential seasons.",
            awardedScore: 12,
            feedback: "Good answer, remember to mention soil replenishment.",
          },
        ],
      };

      const pdf = generateExamPdf(doc);
      expect(Buffer.isBuffer(pdf)).toBe(true);

      const pdfStr = pdf.toString("latin1");
      expect(pdfStr.startsWith("%PDF-1.4")).toBe(true);
      expect(pdfStr).toContain("trailer");
      expect(pdfStr).toContain("startxref");
      expect(pdfStr.endsWith("%%EOF\n")).toBe(true);

      // Watermark string must be embedded inside content streams
      expect(pdfStr).toContain("CONFIDENTIAL WATERMARK");
      expect(pdfStr).toContain("Abdullah");
    });

    test("handles multi-page pagination for large question sets", () => {
      const questions = Array.from({ length: 25 }, (_, i) => ({
        prompt: `Question ${i + 1}: Detailed inquiry into biological ecosystem mechanics with comprehensive explanations and multiple sub-clauses?`,
        points: 4,
        options: ["Option Alpha", "Option Beta", "Option Gamma", "Option Delta"],
      }));

      const doc = {
        title: "Comprehensive Comprehensive Mock",
        branchName: "Secondary English",
        watermark: "WATERMARK EXAM APPROVER",
        date: "2026-11-15",
        questions,
      };

      const pdf = generateExamPdf(doc);
      const pdfStr = pdf.toString("latin1");

      // Verify multiple page objects created
      expect(pdfStr).toContain("/Count ");
      expect(pdfStr).toContain("Page 1 of ");
      expect(pdfStr.includes("Page 2 of ") || pdfStr.includes("Page 3 of ")).toBe(true);
    });
  });
});
