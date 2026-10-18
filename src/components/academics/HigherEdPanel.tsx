"use client";

import React, { useState } from "react";
import { calculateGPA, scoreToGradePoint } from "@/lib/higher-ed/rules";
import { CourseRegStatus } from "@prisma/client";

interface Department {
  id: string;
  name: string;
  code: string;
}

interface Course {
  id: string;
  departmentId: string;
  code: string;
  title: string;
  creditUnits: number;
  level: number;
  semester: number;
  department?: { name: string; code: string };
}

interface CourseReg {
  id: string;
  course: Course;
  creditUnits: number;
  score: number | null;
  grade: string | null;
  gradePoint: number | null;
  status: CourseRegStatus;
}

interface HigherEdPanelProps {
  schoolCode: string;
  initialDepartments?: Department[];
  initialCourses?: Course[];
}

export function HigherEdPanel({ schoolCode: _schoolCode, initialDepartments = [], initialCourses = [] }: HigherEdPanelProps) {
  const [departments] = useState<Department[]>(
    initialDepartments.length > 0
      ? initialDepartments
      : [
          { id: "dept-1", name: "Computer Science & Informatics", code: "CSC" },
          { id: "dept-2", name: "Electrical & Electronics Engineering", code: "EEE" },
          { id: "dept-3", name: "Business Administration", code: "BUS" },
        ],
  );

  const [courses] = useState<Course[]>(
    initialCourses.length > 0
      ? initialCourses
      : [
          {
            id: "c-1",
            departmentId: "dept-1",
            code: "CSC 101",
            title: "Introduction to Computing",
            creditUnits: 3,
            level: 100,
            semester: 1,
          },
          {
            id: "c-2",
            departmentId: "dept-1",
            code: "MTH 101",
            title: "Elementary Mathematics I",
            creditUnits: 3,
            level: 100,
            semester: 1,
          },
          {
            id: "c-3",
            departmentId: "dept-1",
            code: "GST 101",
            title: "Use of English & Communication",
            creditUnits: 2,
            level: 100,
            semester: 1,
          },
          {
            id: "c-4",
            departmentId: "dept-1",
            code: "CSC 201",
            title: "Data Structures & Algorithms",
            creditUnits: 4,
            level: 200,
            semester: 1,
          },
        ],
  );

  const [registrations, setRegistrations] = useState<CourseReg[]>([
    { id: "reg-1", course: courses[0], creditUnits: 3, score: 78, grade: "A", gradePoint: 5.0, status: CourseRegStatus.COMPLETED },
    { id: "reg-2", course: courses[1], creditUnits: 3, score: 64, grade: "B", gradePoint: 4.0, status: CourseRegStatus.COMPLETED },
    { id: "reg-3", course: courses[2], creditUnits: 2, score: 71, grade: "A", gradePoint: 5.0, status: CourseRegStatus.COMPLETED },
  ]);

  const [selectedLevel, setSelectedLevel] = useState<number>(100);
  const [selectedSemester, setSelectedSemester] = useState<number>(1);
  const [activeTab, setActiveTab] = useState<"courses" | "registrations">("courses");

  const filteredCourses = courses.filter((c) => c.level === selectedLevel && c.semester === selectedSemester);

  const gpaSummary = calculateGPA(
    registrations.map((r) => ({
      creditUnits: r.creditUnits,
      gradePoint: r.gradePoint,
      status: r.status,
    })),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">Higher-Ed Credit Unit System</h2>
          <p className="text-sm text-muted-foreground">
            Tertiary academic structure: departments, credit-weighted courses, and automated 5.0 scale GPA calculation.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab("courses")}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "courses" ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            Course Catalog
          </button>
          <button
            onClick={() => setActiveTab("registrations")}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "registrations"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            Registrations & GPA
          </button>
        </div>
      </div>

      {activeTab === "courses" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Level:</span>
              {[100, 200, 300, 400, 500].map((lvl) => (
                <button
                  key={lvl}
                  onClick={() => setSelectedLevel(lvl)}
                  className={`rounded px-3 py-1 text-xs font-semibold transition ${
                    selectedLevel === lvl
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-card text-foreground hover:bg-accent"
                  }`}
                >
                  {lvl}L
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Semester:</span>
              {[1, 2].map((sem) => (
                <button
                  key={sem}
                  onClick={() => setSelectedSemester(sem)}
                  className={`rounded px-3 py-1 text-xs font-semibold transition ${
                    selectedSemester === sem
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-card text-foreground hover:bg-accent"
                  }`}
                >
                  Semester {sem}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card overflow-hidden shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Course Code</th>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3 text-center">Credit Units</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredCourses.length > 0 ? (
                  filteredCourses.map((c) => {
                    const dept = departments.find((d) => d.id === c.departmentId);
                    return (
                      <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-semibold text-foreground">{c.code}</td>
                        <td className="px-4 py-3 text-foreground">{c.title}</td>
                        <td className="px-4 py-3 text-muted-foreground">{dept?.name ?? "General"}</td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                            {c.creditUnits} CU
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => {
                              const newReg: CourseReg = {
                                id: `reg-${Date.now()}`,
                                course: c,
                                creditUnits: c.creditUnits,
                                score: null,
                                grade: null,
                                gradePoint: null,
                                status: CourseRegStatus.REGISTERED,
                              };
                              setRegistrations((prev) => [...prev, newReg]);
                            }}
                            className="rounded border border-primary/20 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/10 transition"
                          >
                            + Register
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                      No courses configured for {selectedLevel} Level, Semester {selectedSemester}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "registrations" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Registered Credits</span>
              <p className="mt-1 text-2xl font-bold text-foreground">{gpaSummary.totalCredits} CU</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Quality Points (TQP)</span>
              <p className="mt-1 text-2xl font-bold text-foreground">{gpaSummary.totalQualityPoints}</p>
            </div>
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 shadow-sm">
              <span className="text-xs font-medium uppercase tracking-wider text-primary">Cumulative GPA (5.0 Scale)</span>
              <p className="mt-1 text-2xl font-bold text-primary">{gpaSummary.gpa.toFixed(2)}</p>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card overflow-hidden shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Course</th>
                  <th className="px-4 py-3 text-center">Credit Units</th>
                  <th className="px-4 py-3 text-center">Score</th>
                  <th className="px-4 py-3 text-center">Grade</th>
                  <th className="px-4 py-3 text-center">Grade Point</th>
                  <th className="px-4 py-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {registrations.map((reg) => (
                  <tr key={reg.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-foreground">{reg.course.code}</div>
                      <div className="text-xs text-muted-foreground">{reg.course.title}</div>
                    </td>
                    <td className="px-4 py-3 text-center text-foreground">{reg.creditUnits}</td>
                    <td className="px-4 py-3 text-center">
                      <input
                        type="number"
                        value={reg.score ?? ""}
                        min={0}
                        max={100}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          if (val >= 0 && val <= 100) {
                            const { grade, gradePoint } = scoreToGradePoint(val);
                            setRegistrations((prev) =>
                              prev.map((r) =>
                                r.id === reg.id ? { ...r, score: val, grade, gradePoint, status: CourseRegStatus.COMPLETED } : r,
                              ),
                            );
                          }
                        }}
                        className="w-16 rounded border border-input bg-background px-2 py-1 text-center text-sm"
                      />
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-foreground">{reg.grade ?? "—"}</td>
                    <td className="px-4 py-3 text-center font-medium text-foreground">
                      {reg.gradePoint !== null ? reg.gradePoint.toFixed(1) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          reg.status === CourseRegStatus.COMPLETED
                            ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
                            : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                        }`}
                      >
                        {reg.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
