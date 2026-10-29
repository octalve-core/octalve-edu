import { test, expect } from "@playwright/test";
import { isSchoolTimeZone, resolveSchoolTimeZone, startOfSchoolDay, MAX_TIME_ZONE_LENGTH } from "@/lib/school-settings/school-day";

// The day the daily limits count in: the school's day, in the school's own time zone (SchoolSettings.timeZone), UTC when it has not chosen one or the stored name is not a time zone.
// Every case here fixes the clock.

const start = (at: string, zone?: string | null) => startOfSchoolDay(new Date(at), zone).toISOString();

test.describe("the UTC day (the default, and what these limits always used)", () => {
  test("a day starts at midnight UTC", () => {
    expect(start("2026-10-29T23:59:59.999Z", "UTC")).toBe("2026-10-29T00:00:00.000Z");
    expect(start("2026-10-30T00:00:00.000Z", "UTC")).toBe("2026-10-30T00:00:00.000Z");
    expect(start("2026-10-29T00:00:00.000Z", "UTC")).toBe("2026-10-29T00:00:00.000Z");
  });

  test("with no zone given it is the UTC day", () => {
    expect(startOfSchoolDay(new Date("2026-10-29T23:30:00.000Z")).toISOString()).toBe("2026-10-29T00:00:00.000Z");
    expect(start("2026-10-29T23:30:00.000Z", null)).toBe("2026-10-29T00:00:00.000Z");
  });
});

test.describe("a school in Lagos (UTC+1, no daylight saving)", () => {
  test("the day starts at 23:00 UTC the evening before, so a pupil at 00:30 has a new day, not 01:00", () => {
    expect(start("2026-10-29T22:59:59.999Z", "Africa/Lagos")).toBe("2026-10-28T23:00:00.000Z"); // 23:59:59 on the 29th
    expect(start("2026-10-29T23:00:00.000Z", "Africa/Lagos")).toBe("2026-10-29T23:00:00.000Z"); // 00:00 on the 30th
    expect(start("2026-10-29T23:30:00.000Z", "Africa/Lagos")).toBe("2026-10-29T23:00:00.000Z"); // 00:30 on the 30th
    expect(start("2026-10-30T12:00:00.000Z", "Africa/Lagos")).toBe("2026-10-29T23:00:00.000Z");
  });
});

test.describe("other offsets", () => {
  test("half an hour: Kolkata (UTC+5:30)", () => {
    expect(start("2026-10-29T18:29:59.000Z", "Asia/Kolkata")).toBe("2026-10-28T18:30:00.000Z");
    expect(start("2026-10-29T18:30:00.000Z", "Asia/Kolkata")).toBe("2026-10-29T18:30:00.000Z");
  });

  test("ahead of UTC by more than half a day: Auckland in October (UTC+13)", () => {
    expect(start("2026-10-29T10:59:59.000Z", "Pacific/Auckland")).toBe("2026-10-28T11:00:00.000Z");
    expect(start("2026-10-29T11:00:00.000Z", "Pacific/Auckland")).toBe("2026-10-29T11:00:00.000Z");
  });

  test("the furthest ahead: Kiritimati (UTC+14), whose day starts at 10:00 UTC", () => {
    expect(start("2026-10-29T09:59:59.000Z", "Pacific/Kiritimati")).toBe("2026-10-28T10:00:00.000Z");
    expect(start("2026-10-29T10:00:00.000Z", "Pacific/Kiritimati")).toBe("2026-10-29T10:00:00.000Z");
    expect(start("2026-10-29T23:00:00.000Z", "Pacific/Kiritimati")).toBe("2026-10-29T10:00:00.000Z");
  });

  test("behind UTC: Honolulu (UTC-10)", () => {
    expect(start("2026-10-29T09:59:59.000Z", "Pacific/Honolulu")).toBe("2026-10-28T10:00:00.000Z");
    expect(start("2026-10-29T10:00:00.000Z", "Pacific/Honolulu")).toBe("2026-10-29T10:00:00.000Z");
  });
});

test.describe("daylight saving", () => {
  test("New York: the day that gains an hour (1 November 2026) starts at 04:00 UTC and the next at 05:00 UTC", () => {
    expect(start("2026-11-01T04:00:00.000Z", "America/New_York")).toBe("2026-11-01T04:00:00.000Z"); // 00:00 EDT
    expect(start("2026-11-01T12:00:00.000Z", "America/New_York")).toBe("2026-11-01T04:00:00.000Z"); // 07:00 EST, same day
    expect(start("2026-11-02T04:59:59.000Z", "America/New_York")).toBe("2026-11-01T04:00:00.000Z"); // 23:59:59 EST, still 1 November
    expect(start("2026-11-02T05:00:00.000Z", "America/New_York")).toBe("2026-11-02T05:00:00.000Z"); // 00:00 EST
  });

  test("New York: the day that loses an hour (8 March 2026) starts at 05:00 UTC and the next at 04:00 UTC", () => {
    expect(start("2026-03-08T05:00:00.000Z", "America/New_York")).toBe("2026-03-08T05:00:00.000Z"); // 00:00 EST
    expect(start("2026-03-08T20:00:00.000Z", "America/New_York")).toBe("2026-03-08T05:00:00.000Z"); // 16:00 EDT, same day
    expect(start("2026-03-09T04:00:00.000Z", "America/New_York")).toBe("2026-03-09T04:00:00.000Z"); // 00:00 EDT
  });

  test("Cairo, where the clock jumps from 00:00 to 01:00 (24 April 2026): the day starts at the jump", () => {
    expect(start("2026-04-24T12:00:00.000Z", "Africa/Cairo")).toBe("2026-04-23T22:00:00.000Z");
    expect(start("2026-04-23T21:59:59.000Z", "Africa/Cairo")).toBe("2026-04-22T22:00:00.000Z"); // still the 23rd
  });
});

test.describe("what counts as a time zone name", () => {
  test("real names, in the shapes they come in", () => {
    for (const name of ["UTC", "Africa/Lagos", "America/Argentina/Buenos_Aires", "Etc/GMT+5", "Asia/Kolkata", "Pacific/Kiritimati"]) {
      expect(isSchoolTimeZone(name), name).toBe(true);
    }
  });

  test("not a name: unknown, empty, padded, an offset, free text, too long, or not text at all", () => {
    for (const bad of [
      "Mars/Olympus_Mons",
      "",
      " ",
      " Africa/Lagos",
      "Africa/Lagos ",
      "+01:00",
      "GMT+1:00",
      "Africa Lagos",
      "Africa/Lagos\n",
      "x".repeat(MAX_TIME_ZONE_LENGTH + 1),
    ]) {
      expect(isSchoolTimeZone(bad), JSON.stringify(bad)).toBe(false);
    }
    for (const bad of [null, undefined, 0, 1, true, {}, [], ["UTC"]]) expect(isSchoolTimeZone(bad), String(bad)).toBe(false);
  });
});

test.describe("which zone applies", () => {
  const warned: string[] = [];
  const realWarn = console.warn;
  test.beforeEach(() => {
    warned.length = 0;
    console.warn = (...args: unknown[]) => void warned.push(args.map(String).join(" "));
  });
  test.afterEach(() => {
    console.warn = realWarn;
  });

  test("a stored name that is a time zone is used as it is", () => {
    expect(resolveSchoolTimeZone("Africa/Lagos")).toBe("Africa/Lagos");
    expect(warned).toHaveLength(0);
  });

  test("a school that has no value is on UTC, and says nothing", () => {
    expect(resolveSchoolTimeZone(null)).toBe("UTC");
    expect(resolveSchoolTimeZone(undefined)).toBe("UTC");
    expect(resolveSchoolTimeZone("UTC")).toBe("UTC");
    expect(warned).toHaveLength(0);
  });

  test("a stored value that is not a time zone is never trusted: UTC, with one warning however often it is read", () => {
    expect(resolveSchoolTimeZone("Mars/Olympus_Mons")).toBe("UTC");
    expect(resolveSchoolTimeZone("Mars/Olympus_Mons")).toBe("UTC");
    expect(warned).toHaveLength(1);
    expect(warned[0]).toContain("Mars/Olympus_Mons");
    expect(resolveSchoolTimeZone("y".repeat(500))).toBe("UTC"); // far too long to be a name
    expect(warned).toHaveLength(2);
    expect(warned[1]!.length).toBeLessThan(200);
  });

  test("an invalid zone given straight to startOfSchoolDay falls back to the UTC day, and so does an empty one", () => {
    expect(start("2026-10-29T23:30:00.000Z", "Planet/Nine")).toBe("2026-10-29T00:00:00.000Z");
    expect(start("2026-10-29T23:30:00.000Z", "")).toBe("2026-10-29T00:00:00.000Z");
  });
});
