import { z } from "zod";
import { NotificationChannel, NotificationDispatchStatus } from "@prisma/client";
import { audienceWords, findUnfillableTags } from "./tags";

export const queryTemplatesSchema = z.object({
  channel: z.nativeEnum(NotificationChannel).optional(),
  search: z.string().trim().optional(),
});
export type QueryTemplatesInput = z.infer<typeof queryTemplatesSchema>;

export const createTemplateSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[A-Z0-9_]+$/, "Code must be uppercase alphanumeric with underscores"),
  name: z.string().trim().min(2).max(100),
  channel: z.nativeEnum(NotificationChannel),
  subjectTemplate: z.string().trim().max(255).optional(),
  bodyTemplate: z.string().trim().min(1, "Template body cannot be empty"),
  variables: z.array(z.string().trim()).optional().default([]),
});
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;

export const updateTemplateSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  subjectTemplate: z.string().trim().max(255).nullable().optional(),
  bodyTemplate: z.string().trim().min(1, "Template body cannot be empty").optional(),
});
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;

export const queryDispatchesSchema = z.object({
  status: z.nativeEnum(NotificationDispatchStatus).optional(),
  channel: z.nativeEnum(NotificationChannel).optional(),
  recipient: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type QueryDispatchesInput = z.infer<typeof queryDispatchesSchema>;

export const createBroadcastSchema = z
  .object({
    channel: z.nativeEnum(NotificationChannel),
    audienceRole: z.enum(["ALL", "GUARDIAN", "STAFF", "STUDENT"]).default("ALL"),
    campusId: z.string().trim().optional(),
    classArmId: z.string().trim().optional(),
    subject: z.string().trim().max(255).optional(),
    body: z.string().trim().min(1, "Broadcast body cannot be empty"),
  })
  // Three things that cannot work are refused here, before anything is queued (task 0056), so the route and the service agree and no dispatch row exists for them.
  .superRefine((value, ctx) => {
    if (value.channel === NotificationChannel.IN_APP) {
      // No screen reads an In-App dispatch back to a person; Announcements are the product's in-app feed.
      ctx.addIssue({
        code: "custom",
        path: ["channel"],
        message: "In-App messages are sent from Announcements: nothing here shows them to the person.",
      });
      return;
    }
    if (value.audienceRole === "STUDENT") {
      // The broadcast has no branch for students: it would answer "queued for 0 recipients".
      ctx.addIssue({
        code: "custom",
        path: ["audienceRole"],
        message: "Students are reached through their guardians: send to Parents / Guardians.",
      });
      return;
    }
    const unfillable = findUnfillableTags([value.body, value.subject], value.audienceRole);
    if (unfillable.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["body"],
        message: `These tags cannot be filled for ${audienceWords(value.audienceRole)}: ${unfillable.map((name) => `{{${name}}}`).join(", ")}. Remove them or choose another audience.`,
      });
    }
  });
export type CreateBroadcastInput = z.infer<typeof createBroadcastSchema>;
