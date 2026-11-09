import { z } from "zod";
import { ProgramKind } from "@prisma/client";
import { idField } from "@/lib/academics/http";
import {
  HAS_CONTROL_CHARACTER,
  MAX_DESCRIPTION,
  MAX_GROUP_NAME,
  MAX_LEVEL_NAME,
  MAX_LEVELS,
  MAX_PROGRAM_NAME,
  cleanName,
  parseIsoDate,
} from "./rules";

// Every body is `.strict()`: a key the route does not know is a mistake or an attack, and it is refused, never ignored.

const id = (label: string) => idField.regex(/^[A-Za-z0-9_-]+$/, `${label} is not valid`);
const name = (label: string, max: number) =>
  z
    .string()
    .transform(cleanName)
    .pipe(
      z
        .string()
        .min(1, `${label} is required`)
        .max(max, `${label} can be at most ${max} characters`)
        .refine((value) => !HAS_CONTROL_CHARACTER.test(value), `${label} has a character that is not allowed`),
    );
const isoDate = (label: string) => z.string().refine((value) => parseIsoDate(value) !== null, `${label} must be a real date (YYYY-MM-DD)`);
const description = z
  .string()
  .trim()
  .max(MAX_DESCRIPTION, `The description can be at most ${MAX_DESCRIPTION} characters`)
  .refine((value) => !HAS_CONTROL_CHARACTER.test(value.replace(/[\n\r\t]/g, " ")), "The description has a character that is not allowed");

export const levelLabelsSchema = z
  .array(name("A level name", MAX_LEVEL_NAME))
  .min(1, "Give the program at least one level name")
  .max(MAX_LEVELS, `A program can have at most ${MAX_LEVELS} level names`)
  .refine((labels) => new Set(labels.map((label) => label.toLowerCase())).size === labels.length, "Each level needs a different name");

const durationSchema = z
  .object({ value: z.number().int().min(1).max(1200), unit: z.enum(["MONTHS", "YEARS"]) })
  .strict()
  .refine((d) => (d.unit === "YEARS" ? d.value <= 100 : d.value <= 1200), "That is longer than a program can be");

/// `campusIds` empty = the program runs school-wide (the only way for a school with no campuses).
export const createProgramSchema = z
  .object({
    name: name("The program name", MAX_PROGRAM_NAME),
    description: description.nullish(),
    kind: z.nativeEnum(ProgramKind),
    startsOn: isoDate("The start date").nullish(),
    endsOn: isoDate("The end date").nullish(),
    duration: durationSchema.nullish(),
    campusIds: z.array(id("A campus")).max(50).default([]),
    levelLabels: levelLabelsSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    const problem = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
    if (value.kind === ProgramKind.FIXED_TERM) {
      if (!value.startsOn) problem("startsOn", "A program for a period needs a start date");
      if (!value.endsOn && !value.duration) problem("duration", "Say how long it runs, or give the end date");
      if (value.endsOn && value.duration) problem("duration", "Give the duration or the end date, not both");
    } else {
      if (value.endsOn) problem("endsOn", "A program that never ends has no end date");
      if (value.duration) problem("duration", "A program that never ends has no duration");
    }
    if (value.endsOn && value.startsOn && value.endsOn <= value.startsOn) problem("endsOn", "The end date must be after the start date");
    if (new Set(value.campusIds).size !== value.campusIds.length) problem("campusIds", "A campus is listed twice");
  });
export type CreateProgramInput = z.infer<typeof createProgramSchema>;

export const updateProgramSchema = z
  .object({
    name: name("The program name", MAX_PROGRAM_NAME).optional(),
    description: description.nullable().optional(),
    startsOn: isoDate("The start date").nullable().optional(),
    endsOn: isoDate("The end date").nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Nothing to change");
export type UpdateProgramInput = z.infer<typeof updateProgramSchema>;

export const statusSchema = z.object({ action: z.enum(["activate", "archive", "restore"]) }).strict();
export const linkCampusSchema = z.object({ campusId: id("The campus") }).strict();
export const levelsSchema = z.object({ labels: levelLabelsSchema }).strict();

export const createGroupSchema = z
  .object({ parentId: id("The parent group").nullish(), name: name("The group name", MAX_GROUP_NAME) })
  .strict();
export const updateGroupSchema = z
  .union([
    z.object({ name: name("The group name", MAX_GROUP_NAME) }).strict(),
    z.object({ move: z.enum(["up", "down"]) }).strict(),
    z.object({ archived: z.boolean() }).strict(),
  ])
  .describe("exactly one of: a new name, a move, or archived true/false");

/// Slice P1 names program admins only (the other roles come with slice P3). Only the school's administrator may.
export const nameAdminSchema = z.object({ userId: id("The person") }).strict();

export { switchSettingSchema as programsSettingSchema } from "@/lib/settings/switch-schema";
