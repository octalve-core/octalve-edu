import { z } from "zod";
import { Gender } from "@prisma/client";
import { idField } from "@/lib/academics/http";
import { MAX_REASON, MIN_REASON } from "@/lib/standing/rules";
import { PARTICIPANT_KINDS, PLACE_STATES, MAX_EMAIL, MAX_PERSON_NAME, standaloneProblems } from "./people-rules";
import { HAS_CONTROL_CHARACTER, cleanName, parseIsoDate, toIsoDate } from "./rules";

// Every body is `.strict()`: a key the route does not know is a mistake or an attack, and it is refused, never ignored.

const id = (label: string) => idField.regex(/^[A-Za-z0-9_-]+$/, `${label} is not valid`);

const personName = (label: string) =>
  z
    .string()
    .transform(cleanName)
    .pipe(
      z
        .string()
        .min(1, `${label} is required`)
        .max(MAX_PERSON_NAME, `${label} can be at most ${MAX_PERSON_NAME} characters`)
        .refine((value) => !HAS_CONTROL_CHARACTER.test(value), `${label} has a character that is not allowed`),
    );

const birthDate = z
  .string()
  .refine((value) => parseIsoDate(value) !== null, "The birth date must be a real date (YYYY-MM-DD)")
  .refine((value) => value <= toIsoDate(new Date()), "The birth date can't be in the future");

const phone = z
  .string()
  .trim()
  .regex(/^[0-9+()\-\s]{7,30}$/, "A phone number has 7 to 30 digits, and may use + ( ) - and spaces");

const email = z
  .string()
  .trim()
  .max(MAX_EMAIL)
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "That doesn't look like an e-mail address");

const reason = z
  .string()
  .trim()
  .min(MIN_REASON, `Say why (at least ${MIN_REASON} characters)`)
  .max(MAX_REASON, `The reason can be at most ${MAX_REASON} characters`)
  .refine((value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value), "The reason has a character that is not allowed");

const linkedStudent = z.object({ kind: z.literal("STUDENT"), studentId: id("The student"), groupId: id("The group") }).strict();
const linkedStaff = z.object({ kind: z.literal("STAFF"), staffRecordId: id("The member of staff"), groupId: id("The group") }).strict();
const linkedGuardian = z.object({ kind: z.literal("GUARDIAN"), guardianId: id("The guardian"), groupId: id("The group") }).strict();
const standaloneFor = <K extends "ADULT" | "CHILD">(kind: K) =>
  z
    .object({
      kind: z.literal(kind),
      firstName: personName("The first name"),
      lastName: personName("The last name"),
      gender: z.nativeEnum(Gender).nullish(),
      dateOfBirth: birthDate.nullish(),
      phone: phone.nullish(),
      email: email.nullish(),
      guardianName: personName("The guardian's name").nullish(),
      guardianPhone: phone.nullish(),
      campusId: id("The campus").nullish(),
      groupId: id("The group"),
      confirmNamesake: z.boolean().optional(),
    })
    .strict()
    .superRefine((value, context) => {
      for (const problem of standaloneProblems(value))
        context.addIssue({ code: "custom", path: [problem.path.replace(/^body\./, "")], message: problem.message });
    });

/// One schema per kind, told apart by `kind`, so a refusal names the field that is wrong ("body.dateOfBirth") and not just "invalid input".
export const addPersonSchema = z.discriminatedUnion("kind", [
  linkedStudent,
  linkedStaff,
  linkedGuardian,
  standaloneFor("ADULT"),
  standaloneFor("CHILD"),
]);

export const addClassSchema = z
  .object({ classArmId: id("The class"), groupId: id("The group"), confirm: z.boolean().default(false) })
  .strict();

export const editPersonSchema = z
  .object({
    firstName: personName("The first name").optional(),
    lastName: personName("The last name").optional(),
    gender: z.nativeEnum(Gender).nullable().optional(),
    dateOfBirth: birthDate.nullable().optional(),
    phone: phone.nullable().optional(),
    email: email.nullable().optional(),
    guardianName: personName("The guardian's name").nullable().optional(),
    guardianPhone: phone.nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Nothing to change");

export const movePersonSchema = z.object({ groupId: id("The group") }).strict();

export const placeSchema = z.object({ action: z.enum(["withdraw", "reenrol"]), reason, groupId: id("The group").optional() }).strict();

export const personStandingSchema = z
  .object({
    action: z.enum(["suspend", "lift", "expel", "reinstate"]),
    reason,
    until: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "The end date must be a date (YYYY-MM-DD)")
      .nullish(),
  })
  .strict();

export const listPeopleQuery = z.object({
  q: z.string().trim().max(64, "Search for at most 64 characters.").optional(),
  groupId: id("The group").optional(),
  campusId: id("The campus").optional(),
  kind: z.enum(PARTICIPANT_KINDS).optional(),
  state: z.enum(PLACE_STATES).optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
});

export const candidatesQuery = z.object({ kind: z.enum(["STUDENT", "STAFF", "GUARDIAN"]), q: z.string().trim().max(64).default("") });
