"use client";

import { useState, useEffect, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { BookOpenIcon, CheckCircle2Icon, FileTextIcon } from "@/components/ui/icons";

interface SubjectOption {
  id: string;
  name: string;
}

interface ClassGroupOption {
  id: string;
  name: string;
}

interface AssignmentItem {
  id: string;
  title: string;
  description: string | null;
  instructions: string | null;
  dueDate: string | null;
  totalPoints: number;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  subject: { id: string; name: string };
  classGroup: { id: string; name: string } | null;
  _count: { submissions: number };
}

interface MaterialItem {
  id: string;
  title: string;
  description: string | null;
  content: string | null;
  subject: { id: string; name: string };
  classGroup: { id: string; name: string } | null;
  attachments: Array<{ title: string; url: string }>;
  createdAt: string;
}

interface QuizItem {
  id: string;
  title: string;
  instructions: string | null;
  timeLimitMinutes: number | null;
  passingScore: number | null;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  subject: { id: string; name: string };
  _count: { questions: number; attempts: number };
}

interface SubmissionDetail {
  id: string;
  status: string;
  score: number | null;
  feedback: string | null;
  submittedAt: string | null;
  student: { id: string; firstName: string; lastName: string; admissionNo: string };
}

export function LmsPanel({
  schoolCode,
  canManage = false,
  subjects = [],
  classGroups = [],
}: {
  schoolCode: string;
  canManage?: boolean;
  subjects: SubjectOption[];
  classGroups: ClassGroupOption[];
}) {
  const [tab, setTab] = useState<"assignments" | "materials" | "quizzes">("assignments");
  const [assignments, setAssignments] = useState<AssignmentItem[]>([]);
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [quizzes, setQuizzes] = useState<QuizItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Assignment Modal
  const [isAssignmentModalOpen, setIsAssignmentModalOpen] = useState(false);
  const [assignmentTitle, setAssignmentTitle] = useState("");
  const [assignmentSubjectId, setAssignmentSubjectId] = useState(subjects[0]?.id ?? "");
  const [assignmentClassGroupId, setAssignmentClassGroupId] = useState("");
  const [assignmentPoints, setAssignmentPoints] = useState(50);
  const [assignmentDueDate, setAssignmentDueDate] = useState("");
  const [assignmentInstructions, setAssignmentInstructions] = useState("");

  // Submissions Drawer
  const [selectedAssignment, setSelectedAssignment] = useState<AssignmentItem | null>(null);
  const [submissions, setSubmissions] = useState<SubmissionDetail[]>([]);
  const [gradingScores, setGradingScores] = useState<Record<string, number>>({});
  const [gradingFeedbacks, setGradingFeedbacks] = useState<Record<string, string>>({});

  const [isPending, startTransition] = useTransition();

  const reloadData = async () => {
    try {
      let endpoint = `/api/v1/schools/${schoolCode}/lms/assignments`;
      if (tab === "materials") endpoint = `/api/v1/schools/${schoolCode}/lms/materials`;
      else if (tab === "quizzes") endpoint = `/api/v1/schools/${schoolCode}/lms/quizzes`;

      const res = await fetch(endpoint);
      const json = await res.json();
      if (json.data) {
        if (tab === "assignments") setAssignments(json.data);
        else if (tab === "materials") setMaterials(json.data);
        else if (tab === "quizzes") setQuizzes(json.data);
      }
    } catch {
      setError("Failed to refresh LMS data");
    }
  };

  useEffect(() => {
    let ignore = false;

    async function fetchData() {
      try {
        let endpoint = `/api/v1/schools/${schoolCode}/lms/assignments`;
        if (tab === "materials") endpoint = `/api/v1/schools/${schoolCode}/lms/materials`;
        else if (tab === "quizzes") endpoint = `/api/v1/schools/${schoolCode}/lms/quizzes`;

        const res = await fetch(endpoint);
        const json = await res.json();
        if (!ignore && json.data) {
          if (tab === "assignments") setAssignments(json.data);
          else if (tab === "materials") setMaterials(json.data);
          else if (tab === "quizzes") setQuizzes(json.data);
        }
      } catch {
        if (!ignore) setError("Failed to load LMS data. Please try again.");
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    void fetchData();

    return () => {
      ignore = true;
    };
  }, [tab, schoolCode]);

  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignmentTitle || !assignmentSubjectId) return;

    startTransition(async () => {
      try {
        const res = await fetch(`/api/v1/schools/${schoolCode}/lms/assignments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: assignmentTitle,
            subjectId: assignmentSubjectId,
            classGroupId: assignmentClassGroupId || null,
            totalPoints: assignmentPoints,
            dueDate: assignmentDueDate ? new Date(assignmentDueDate).toISOString() : null,
            instructions: assignmentInstructions || null,
            status: "PUBLISHED",
          }),
        });
        if (res.ok) {
          setIsAssignmentModalOpen(false);
          setAssignmentTitle("");
          setAssignmentInstructions("");
          reloadData();
        } else {
          setError("Failed to create assignment");
        }
      } catch {
        setError("Error creating assignment");
      }
    });
  };

  const handleOpenSubmissions = async (assignment: AssignmentItem) => {
    setSelectedAssignment(assignment);
    try {
      const res = await fetch(`/api/v1/schools/${schoolCode}/lms/assignments/${assignment.id}`);
      const json = await res.json();
      if (json.data?.submissions) {
        setSubmissions(json.data.submissions);
      }
    } catch {
      setError("Failed to load submissions");
    }
  };

  const handleGradeSubmission = async (submissionId: string) => {
    const score = gradingScores[submissionId];
    const feedback = gradingFeedbacks[submissionId] || "";
    if (score === undefined || score < 0) return;

    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/v1/schools/${schoolCode}/lms/assignments/${selectedAssignment?.id}/submissions/${submissionId}/grade`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              score,
              feedback,
              status: "GRADED",
            }),
          },
        );
        if (res.ok) {
          if (selectedAssignment) handleOpenSubmissions(selectedAssignment);
        }
      } catch {
        setError("Failed to record grade");
      }
    });
  };

  return (
    <div className="space-y-6">
      {error && <Alert variant="error">{error}</Alert>}

      {/* Tabs */}
      <div className="flex border-b border-line gap-4">
        <button
          type="button"
          onClick={() => {
            setTab("assignments");
            setSelectedAssignment(null);
          }}
          className={`pb-3 text-sm flex items-center gap-2 border-b-2 transition-colors ${
            tab === "assignments" ? "border-brand-fg text-fg font-semibold" : "border-transparent text-fg-muted hover:text-fg font-medium"
          }`}
        >
          <FileTextIcon className="h-4 w-4" />
          Assignments & Homework
        </button>
        <button
          type="button"
          onClick={() => {
            setTab("materials");
            setSelectedAssignment(null);
          }}
          className={`pb-3 text-sm flex items-center gap-2 border-b-2 transition-colors ${
            tab === "materials" ? "border-brand-fg text-fg font-semibold" : "border-transparent text-fg-muted hover:text-fg font-medium"
          }`}
        >
          <BookOpenIcon className="h-4 w-4" />
          Course Materials & Notes
        </button>
        <button
          type="button"
          onClick={() => {
            setTab("quizzes");
            setSelectedAssignment(null);
          }}
          className={`pb-3 text-sm flex items-center gap-2 border-b-2 transition-colors ${
            tab === "quizzes" ? "border-brand-fg text-fg font-semibold" : "border-transparent text-fg-muted hover:text-fg font-medium"
          }`}
        >
          <CheckCircle2Icon className="h-4 w-4" />
          Online Quizzes
        </button>
      </div>

      {/* Header Actions */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-fg">
            {tab === "assignments" && "Assignments & Homework"}
            {tab === "materials" && "Study Guides & Curriculum Notes"}
            {tab === "quizzes" && "Interactive Online Quizzes"}
          </h2>
          <p className="text-xs text-fg-2">
            {tab === "assignments" && "Set class homework, track student turn-ins, and assign grades."}
            {tab === "materials" && "Centralized syllabus materials, slides, and study PDFs for students."}
            {tab === "quizzes" && "Objective self-marking quizzes for term assessments and revision."}
          </p>
        </div>

        {canManage && tab === "assignments" && <Button onClick={() => setIsAssignmentModalOpen(true)}>+ Create Assignment</Button>}
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-fg-muted">Loading LMS resources...</div>
      ) : (
        <>
          {/* Assignments Tab */}
          {tab === "assignments" && (
            <div className="space-y-4">
              {assignments.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-line p-12 text-center">
                  <FileTextIcon className="mx-auto h-8 w-8 text-fg-muted" />
                  <p className="mt-3 text-sm font-medium text-fg">No assignments created yet</p>
                  <p className="mt-1 text-xs text-fg-muted">Set homework or projects for your students to submit online.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {assignments.map((assignment) => (
                    <div
                      key={assignment.id}
                      className="rounded-2xl border border-line bg-surface p-5 shadow-sm hover:border-brand-strong transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <span className="inline-block rounded-full bg-brand-tint px-2.5 py-0.5 text-xs font-semibold text-brand-fg">
                            {assignment.subject.name}
                          </span>
                          {assignment.classGroup && (
                            <span className="ml-2 inline-block rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-fg-2">
                              {assignment.classGroup.name}
                            </span>
                          )}
                          <h3 className="mt-2 text-base font-bold text-fg">{assignment.title}</h3>
                        </div>
                        <span className="text-xs font-semibold text-fg-2 bg-surface-2 px-2 py-1 rounded-lg">
                          {assignment.totalPoints} pts
                        </span>
                      </div>

                      {assignment.description && <p className="mt-2 text-xs text-fg-2 line-clamp-2">{assignment.description}</p>}

                      <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-xs text-fg-muted">
                        <span>{assignment.dueDate ? `Due: ${new Date(assignment.dueDate).toLocaleDateString()}` : "No due date"}</span>
                        <button
                          type="button"
                          onClick={() => handleOpenSubmissions(assignment)}
                          className="font-semibold text-brand-fg hover:underline"
                        >
                          {assignment._count.submissions} Submissions →
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Materials Tab */}
          {tab === "materials" && (
            <div className="space-y-4">
              {materials.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-line p-12 text-center">
                  <BookOpenIcon className="mx-auto h-8 w-8 text-fg-muted" />
                  <p className="mt-3 text-sm font-medium text-fg">No learning materials uploaded yet</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {materials.map((mat) => (
                    <div key={mat.id} className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
                      <span className="inline-block rounded-full bg-brand-tint px-2.5 py-0.5 text-xs font-semibold text-brand-fg">
                        {mat.subject.name}
                      </span>
                      <h3 className="mt-2 text-base font-bold text-fg">{mat.title}</h3>
                      {mat.description && <p className="mt-1 text-xs text-fg-2">{mat.description}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Quizzes Tab */}
          {tab === "quizzes" && (
            <div className="space-y-4">
              {quizzes.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-line p-12 text-center">
                  <CheckCircle2Icon className="mx-auto h-8 w-8 text-fg-muted" />
                  <p className="mt-3 text-sm font-medium text-fg">No online quizzes published yet</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {quizzes.map((quiz) => (
                    <div key={quiz.id} className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
                      <span className="inline-block rounded-full bg-brand-tint px-2.5 py-0.5 text-xs font-semibold text-brand-fg">
                        {quiz.subject.name}
                      </span>
                      <h3 className="mt-2 text-base font-bold text-fg">{quiz.title}</h3>
                      <div className="mt-3 flex items-center justify-between text-xs text-fg-muted">
                        <span>{quiz._count.questions} questions</span>
                        <span>{quiz.timeLimitMinutes ? `${quiz.timeLimitMinutes} mins` : "Untimed"}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Submissions Grading Drawer */}
      {selectedAssignment && (
        <div className="rounded-2xl border border-brand/20 bg-surface-2 p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <div>
              <h3 className="text-base font-bold text-fg">Submissions: {selectedAssignment.title}</h3>
              <p className="text-xs text-fg-muted">Total Marks: {selectedAssignment.totalPoints}</p>
            </div>
            <Button variant="ghost" onClick={() => setSelectedAssignment(null)}>
              Close
            </Button>
          </div>

          {submissions.length === 0 ? (
            <p className="py-6 text-center text-sm text-fg-muted">No student submissions yet.</p>
          ) : (
            <div className="space-y-3">
              {submissions.map((sub) => (
                <div
                  key={sub.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-line bg-surface p-4 shadow-sm"
                >
                  <div>
                    <p className="text-sm font-bold text-fg">
                      {sub.student.firstName} {sub.student.lastName} ({sub.student.admissionNo})
                    </p>
                    <p className="text-xs text-fg-muted">
                      Status: <span className="font-semibold text-brand-fg">{sub.status}</span>
                      {sub.submittedAt && ` • ${new Date(sub.submittedAt).toLocaleTimeString()}`}
                    </p>
                    {sub.feedback && <p className="mt-1 text-xs italic text-fg-2">Feedback: {sub.feedback}</p>}
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      placeholder="Score"
                      defaultValue={sub.score ?? ""}
                      max={selectedAssignment.totalPoints}
                      onChange={(e) =>
                        setGradingScores((prev) => ({
                          ...prev,
                          [sub.id]: Number(e.target.value),
                        }))
                      }
                      className="w-20 rounded-lg border border-line bg-canvas px-3 py-1.5 text-sm"
                    />
                    <input
                      type="text"
                      placeholder="Comment..."
                      defaultValue={sub.feedback ?? ""}
                      onChange={(e) =>
                        setGradingFeedbacks((prev) => ({
                          ...prev,
                          [sub.id]: e.target.value,
                        }))
                      }
                      className="w-40 rounded-lg border border-line bg-canvas px-3 py-1.5 text-sm"
                    />
                    <Button variant="primary" disabled={isPending} onClick={() => handleGradeSubmission(sub.id)}>
                      Save
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create Assignment Modal */}
      {isAssignmentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-line bg-surface p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-fg">Create Assignment</h3>
            <p className="text-xs text-fg-muted">Publish homework or coursework for your students.</p>

            <form onSubmit={handleCreateAssignment} className="mt-4 space-y-4">
              <div>
                <label htmlFor="assignment-title" className="text-xs font-semibold text-fg">
                  Title
                </label>
                <input
                  id="assignment-title"
                  type="text"
                  required
                  value={assignmentTitle}
                  onChange={(e) => setAssignmentTitle(e.target.value)}
                  placeholder="e.g. Chemical Bonding Worksheet"
                  className="mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-fg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="assignment-subject" className="text-xs font-semibold text-fg">
                    Subject
                  </label>
                  <select
                    id="assignment-subject"
                    value={assignmentSubjectId}
                    onChange={(e) => setAssignmentSubjectId(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-fg"
                  >
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="assignment-group" className="text-xs font-semibold text-fg">
                    Class Group
                  </label>
                  <select
                    id="assignment-group"
                    value={assignmentClassGroupId}
                    onChange={(e) => setAssignmentClassGroupId(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-fg"
                  >
                    <option value="">All Groups</option>
                    {classGroups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="assignment-points" className="text-xs font-semibold text-fg">
                    Total Marks
                  </label>
                  <input
                    id="assignment-points"
                    type="number"
                    min={1}
                    value={assignmentPoints}
                    onChange={(e) => setAssignmentPoints(Number(e.target.value))}
                    className="mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-fg"
                  />
                </div>

                <div>
                  <label htmlFor="assignment-duedate" className="text-xs font-semibold text-fg">
                    Due Date
                  </label>
                  <input
                    id="assignment-duedate"
                    type="date"
                    value={assignmentDueDate}
                    onChange={(e) => setAssignmentDueDate(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-fg"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="assignment-instructions" className="text-xs font-semibold text-fg">
                  Instructions
                </label>
                <textarea
                  id="assignment-instructions"
                  rows={3}
                  value={assignmentInstructions}
                  onChange={(e) => setAssignmentInstructions(e.target.value)}
                  placeholder="Additional notes, submission guidelines, or textbook pages..."
                  className="mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-fg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" type="button" onClick={() => setIsAssignmentModalOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit" disabled={isPending}>
                  Publish Assignment
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
