import { z } from "zod";
import { idField } from "@/lib/academics/http";
import {
  BILLED_TO,
  FEE_FREQUENCIES,
  MAX_DISCOUNT_REASON,
  MAX_EXEMPT,
  MAX_FEE_AMOUNT,
  MAX_FEE_NAME,
  MIN_FEE_AMOUNT,
  periodKeyProblem,
} from "./fees-rules";
import { PARTICIPANT_KINDS } from "./people-rules";
import { HAS_CONTROL_CHARACTER } from "./rules";

// Programs, slice P4: the shapes of the fees routes. Every body is `.strict()`: a key the route does not know is a mistake or an attack, and it is refused.

const id = (label: string) => idField.regex(/^[A-Za-z0-9_-]+$/, `${label} is not valid`);

const text = (label: string, min: number, max: number) =>
  z
    .string()
    .transform((value) => value.trim().replace(/\s+/g, " "))
    .pipe(
      z
        .string()
        .min(min, `${label} is required`)
        .max(max, `${label} can be at most ${max} characters`)
        .refine((value) => !HAS_CONTROL_CHARACTER.test(value), `${label} has a character that is not allowed`),
    );

const money = (label: string, min = MIN_FEE_AMOUNT, max = MAX_FEE_AMOUNT) =>
  z
    .number({ message: `${label} must be a number` })
    .min(min, `${label} must be at least ${min}`)
    .max(max, `${label} can be at most ${max.toLocaleString("en-GB")}`)
    .refine((n) => Math.round(n * 100) / 100 === n, `${label} has at most two decimal places`);

const audience = z
  .object({
    kinds: z.array(z.enum(PARTICIPANT_KINDS)).max(5).optional(),
    campusIds: z.array(id("A campus")).max(50).optional(),
    groupIds: z.array(id("A group")).max(200).optional(),
  })
  .strict();

const itemFields = {
  name: text("The name", 1, MAX_FEE_NAME),
  amount: money("The amount"),
  frequency: z.enum(FEE_FREQUENCIES),
  dueDay: z.number().int().min(1, "The due day is 1 to 28").max(28, "The due day is 1 to 28").nullish(),
  audience,
  discountPercent: money("The discount", 0, 100).nullish(),
  billedTo: z.enum(BILLED_TO),
  exemptIds: z
    .array(id("A person"))
    .max(MAX_EXEMPT)
    .refine((ids) => new Set(ids).size === ids.length, "A person is in the list twice"),
};

export const createFeeItemSchema = z
  .object({
    ...itemFields,
    frequency: itemFields.frequency.default("ONCE"),
    audience: itemFields.audience.default({}),
    billedTo: itemFields.billedTo.default("PARTICIPANT"),
    exemptIds: itemFields.exemptIds.default([]),
  })
  .strict();

export const updateFeeItemSchema = z
  .object({
    name: itemFields.name.optional(),
    amount: itemFields.amount.optional(),
    frequency: itemFields.frequency.optional(),
    dueDay: itemFields.dueDay,
    audience: itemFields.audience.optional(),
    discountPercent: itemFields.discountPercent,
    billedTo: itemFields.billedTo.optional(),
    exemptIds: itemFields.exemptIds.optional(),
    status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Change at least one thing");

const periodKey = z
  .string()
  .refine((key) => periodKeyProblem(key) === null, "A period is `once`, a year such as 2026, or a month such as 2026-11");
export const generateSchema = z.object({ periodKey, confirm: z.boolean().default(false) }).strict();
export const addToOpenSchema = z.object({ periodKey }).strict();

export const invoicesQuery = z.object({
  status: z.enum(["UNPAID", "PARTIALLY_PAID", "PAID", "WAIVED"]).optional(),
  groupId: id("The group").optional(),
  campusId: id("The campus").optional(),
  periodKey: periodKey.optional(),
  q: z.string().trim().max(64, "Search for at most 64 characters.").optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
});

export const paymentSchema = z
  .object({
    amount: money("The amount"),
    channel: text("The channel", 1, 30).default("cash"),
    reference: text("The reference", 1, 64).optional(),
    notes: text("The notes", 0, 500).optional(),
  })
  .strict();

export const discountSchema = z.object({ amount: money("The discount"), reason: text("The reason", 3, MAX_DISCOUNT_REASON) }).strict();
export const invoicePatchSchema = z.object({ payInFull: z.boolean() }).strict();
/// No callback address is taken: a payer is not sent to an address the request chose.
export const gatewaySchema = z
  .object({
    email: z.string().trim().email("Valid email required for the payment gateway").max(254),
    amount: money("The amount").optional(),
  })
  .strict();
