import { z } from "zod";

export const attachmentSchema = z.object({
  title: z.string().min(1).max(200),
  url: z.string().url().or(z.string().min(1)),
  type: z.string().optional(),
  size: z.number().optional(),
});

export const createAssignmentSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  subjectId: z.string().min(1, "Subject is required"),
  classGroupId: z.string().optional().nullable(),
  classArmId: z.string().optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
  instructions: z.string().max(5000).optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
  totalPoints: z.number().int().min(1).max(1000).default(100),
  allowLate: z.boolean().default(true),
  status: z.enum(["DRAFT", "PUBLISHED"]).default("DRAFT"),
  attachments: z.array(attachmentSchema).default([]),
});

export const updateAssignmentSchema = createAssignmentSchema.partial().extend({
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
});

export const submitAssignmentSchema = z.object({
  content: z.string().max(10000).optional().nullable(),
  attachments: z.array(attachmentSchema).default([]),
});

export const gradeSubmissionSchema = z.object({
  score: z.number().min(0),
  feedback: z.string().max(2000).optional().nullable(),
  status: z.enum(["GRADED", "RESUBMIT_REQUESTED"]).default("GRADED"),
});

export const createLearningMaterialSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  subjectId: z.string().min(1, "Subject is required"),
  classGroupId: z.string().optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
  content: z.string().max(20000).optional().nullable(),
  attachments: z.array(attachmentSchema).default([]),
});

export const updateLearningMaterialSchema = createLearningMaterialSchema.partial();

export const quizQuestionSchema = z.object({
  prompt: z.string().min(1).max(1000),
  questionType: z.enum(["MULTIPLE_CHOICE", "TRUE_FALSE", "SHORT_ANSWER"]).default("MULTIPLE_CHOICE"),
  options: z.array(z.object({ id: z.string(), text: z.string() })).default([]),
  correctAnswer: z.string().min(1),
  points: z.number().int().min(1).default(1),
  sortOrder: z.number().int().default(0),
  sourceItemId: z.string().optional().nullable(),
  sourceVersion: z.number().int().optional().nullable(),
  exposedToPractice: z.boolean().default(false),
});

export const createQuizSchema = z.object({
  title: z.string().min(1).max(200),
  subjectId: z.string().min(1),
  classGroupId: z.string().optional().nullable(),
  instructions: z.string().max(2000).optional().nullable(),
  timeLimitMinutes: z.number().int().min(1).max(300).optional().nullable(),
  passingScore: z.number().min(0).max(100).optional().nullable(),
  status: z.enum(["DRAFT", "PUBLISHED"]).default("DRAFT"),
  isExamTemplate: z.boolean().default(false),
  examWindowStart: z.coerce.date().optional().nullable(),
  examWindowEnd: z.coerce.date().optional().nullable(),
  questions: z.array(quizQuestionSchema).min(1, "Quiz must contain at least one question"),
});

export const updateQuizSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  instructions: z.string().max(2000).optional().nullable(),
  timeLimitMinutes: z.number().int().min(1).max(300).optional().nullable(),
  passingScore: z.number().min(0).max(100).optional().nullable(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
  isExamTemplate: z.boolean().optional(),
  examWindowStart: z.coerce.date().optional().nullable(),
  examWindowEnd: z.coerce.date().optional().nullable(),
});

export const submitQuizAttemptSchema = z.object({
  answers: z.array(
    z.object({
      questionId: z.string(),
      answer: z.string(),
    }),
  ),
});
