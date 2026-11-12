import "../support/env";
import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import {
  BROADCAST_TAGS,
  audienceWords,
  findUnfillableTags,
  groupsOf,
  joinNames,
  messageDate,
  tagsFor,
  tagsIn,
} from "@/lib/communication/tags";
import { createBroadcastSchema } from "@/lib/communication/http";

// Task 0056: the Broadcast Composer offers only tags the server fills, and the input check refuses what cannot work (a tag nobody fills, an In-App message nobody can read, a Students audience
// the broadcast has no way to reach) before anything is queued. The values themselves are tested through the API (tests/api/communication-tags-recipients.spec.ts).

const base = { channel: "EMAIL", audienceRole: "GUARDIAN", body: "Hello" } as const;

test.describe("which tags exist, and for whom", () => {
  test("guardians get the pupil's names and classes and the school's name and date; staff get the school's name and date", () => {
    expect(tagsFor("GUARDIAN").map((t) => t.token)).toEqual(["student_name", "class_arm", "school_name", "date"]);
    expect(tagsFor("STAFF").map((t) => t.token)).toEqual(["school_name", "date"]);
  });

  test("the whole community is both groups, so a tag is offered there only if staff can have it too", () => {
    expect(groupsOf("ALL")).toEqual(["GUARDIANS", "STAFF"]);
    expect(tagsFor("ALL").map((t) => t.token)).toEqual(["school_name", "date"]);
    expect(groupsOf("GUARDIAN")).toEqual(["GUARDIANS"]);
    expect(groupsOf("STAFF")).toEqual(["STAFF"]);
  });

  test("a tag the composer can offer is one the server fills (the service source names every one)", () => {
    const service = fs.readFileSync(path.resolve(__dirname, "../../src/lib/communication/service.ts"), "utf-8");
    for (const tag of BROADCAST_TAGS)
      expect(service, `createBroadcast does not fill {{${tag.token}}}`).toMatch(new RegExp(`\\b${tag.token}\\b\\s*[:=]`));
  });
});

test.describe("finding the tags in a text", () => {
  test("tagsIn lists each tag once, in order, with or without spaces inside the braces", () => {
    expect(tagsIn("Dear Guardian, {{student_name}} of {{ class_arm }} - {{student_name}} again {{date}}")).toEqual([
      "student_name",
      "class_arm",
      "date",
    ]);
    expect(tagsIn("no tags here, only {single} and {{ }} and {{two words}}")).toEqual([]);
    expect(tagsIn(null)).toEqual([]);
    expect(tagsIn(undefined)).toEqual([]);
    expect(tagsIn("")).toEqual([]);
  });

  test("findUnfillableTags names what no one would fill, in the body or the subject", () => {
    expect(findUnfillableTags(["Hi {{student_name}} on {{date}}"], "GUARDIAN")).toEqual([]);
    expect(findUnfillableTags(["Hi {{student_name}} on {{date}}"], "STAFF")).toEqual(["student_name"]);
    expect(findUnfillableTags(["Hi {{student_name}} on {{date}}"], "ALL")).toEqual(["student_name"]);
    expect(findUnfillableTags(["Pay by {{due_date}}", "Re {{class_arm}} {{due_date}}"], "GUARDIAN")).toEqual(["due_date"]);
    expect(findUnfillableTags([null, undefined, "plain"], "STAFF")).toEqual([]);
  });

  test("the audience is named in words for the message", () => {
    expect(audienceWords("GUARDIAN")).toBe("guardians");
    expect(audienceWords("STAFF")).toBe("staff");
    expect(audienceWords("ALL")).toBe("the whole community (staff have no pupil)");
  });
});

test.describe("a list of names, and today's date, written for a message", () => {
  test("joinNames writes one, two and more names the way a person would, each once", () => {
    expect(joinNames([])).toBe("");
    expect(joinNames(["Amina Bello"])).toBe("Amina Bello");
    expect(joinNames(["Amina Bello", "Ibrahim Sani"])).toBe("Amina Bello and Ibrahim Sani");
    expect(joinNames(["A", "B", "C"])).toBe("A, B and C");
    expect(joinNames(["Year 1 A", "Year 1 A", "Year 3 B"])).toBe("Year 1 A and Year 3 B");
    expect(joinNames(["", "A"])).toBe("A");
  });

  test("the date is written in full and follows the school's time zone, not the server's", () => {
    const late = new Date("2026-11-12T23:30:00Z"); // 00:30 on the 13th in Lagos (UTC+1), still the 12th in UTC
    expect(messageDate(late, "UTC")).toBe("12 November 2026");
    expect(messageDate(late, "Africa/Lagos")).toBe("13 November 2026");
    expect(messageDate(new Date("2026-03-01T10:00:00Z"), "UTC")).toBe("1 March 2026");
  });
});

test.describe("the broadcast input check", () => {
  test("a normal message passes, with the tags of its audience", () => {
    expect(createBroadcastSchema.safeParse(base).success).toBe(true);
    expect(
      createBroadcastSchema.safeParse({ ...base, body: "Dear Guardian, {{student_name}} ({{class_arm}}) - {{school_name}}, {{date}}" })
        .success,
    ).toBe(true);
    expect(
      createBroadcastSchema.safeParse({ ...base, channel: "SMS", audienceRole: "STAFF", body: "{{school_name}} closes on {{date}}" })
        .success,
    ).toBe(true);
    expect(createBroadcastSchema.safeParse({ ...base, channel: "WHATSAPP", audienceRole: "ALL", body: "{{school_name}}" }).success).toBe(
      true,
    );
  });

  test("In-App is refused, and the message points to Announcements", () => {
    const result = createBroadcastSchema.safeParse({ ...base, channel: "IN_APP" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["channel"]);
      expect(result.error.issues[0].message).toBe("In-App messages are sent from Announcements: nothing here shows them to the person.");
    }
  });

  test("the Students audience is refused: the broadcast has no way to reach them", () => {
    const result = createBroadcastSchema.safeParse({ ...base, audienceRole: "STUDENT" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["audienceRole"]);
      expect(result.error.issues[0].message).toBe("Students are reached through their guardians: send to Parents / Guardians.");
    }
  });

  test("a tag nobody would fill is refused, naming it and the audience", () => {
    const guardians = createBroadcastSchema.safeParse({ ...base, body: "Fees are due {{due_date}} for {{student_name}}" });
    expect(guardians.success).toBe(false);
    if (!guardians.success) {
      expect(guardians.error.issues[0].path).toEqual(["body"]);
      expect(guardians.error.issues[0].message).toBe(
        "These tags cannot be filled for guardians: {{due_date}}. Remove them or choose another audience.",
      );
    }
    const staff = createBroadcastSchema.safeParse({
      ...base,
      audienceRole: "STAFF",
      subject: "About {{student_name}}",
      body: "Hello {{class_arm}}",
    });
    expect(staff.success).toBe(false);
    if (!staff.success)
      expect(staff.error.issues[0].message).toBe(
        "These tags cannot be filled for staff: {{class_arm}}, {{student_name}}. Remove them or choose another audience.",
      );
    const everyone = createBroadcastSchema.safeParse({ ...base, audienceRole: "ALL", body: "Hello {{student_name}}" });
    expect(everyone.success).toBe(false);
    if (!everyone.success)
      expect(everyone.error.issues[0].message).toContain("the whole community (staff have no pupil): {{student_name}}");
  });

  test("the first rule that fails is the one reported (the channel before the audience before the tags)", () => {
    const result = createBroadcastSchema.safeParse({ ...base, channel: "IN_APP", audienceRole: "STUDENT", body: "{{nothing}}" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues).toHaveLength(1);
  });
});
