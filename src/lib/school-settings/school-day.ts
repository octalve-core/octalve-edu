// What "today" means for the limits that count in days: the practice cap (questions a pupil may take in a day) and the reports one person may make in a day.
//
// It is the school's day, not the server's. Each school is in one place, named by its `timeZone` setting (an IANA name such as "Africa/Lagos"); the day starts at midnight
// there. A school that has not chosen one is on "UTC", which is what these limits used before the setting existed, so nothing moves until its administrator sets it. A stored
// value is never trusted: one that is not a time zone name (a hand-edited row, a name this server's time zone data does not know) is read as "UTC" with one warning, never a crash.
//
// Pure, so every rule is unit-tested with a fixed clock, and importable by the settings screen's rules. Daylight saving is handled (the day that gains or loses an hour starts at
// the right instant); a zone whose midnight does not exist on a changeover day starts that day at the first instant after the gap.
//
// Not the same as the anonymous questionnaire's `dayOnly`: that deliberately stamps a response with its UTC date alone, so that the time of day cannot single a pupil out.

export const DEFAULT_SCHOOL_TIME_ZONE = "UTC";
export const MAX_TIME_ZONE_LENGTH = 64;

/// The shape of an IANA name ("UTC", "Africa/Lagos", "America/Argentina/Buenos_Aires", "Etc/GMT+5"). It keeps out the offset forms ("+01:00") and anything with spaces or control
/// characters before the runtime is asked, so that a name is something an administrator picked from a list and not free text.
const NAME_SHAPE = /^[A-Za-z][A-Za-z0-9_+\-/]*$/;

const formatters = new Map<string, Intl.DateTimeFormat | null>();
const warned = new Set<string>();

function formatterFor(zone: string): Intl.DateTimeFormat | null {
  if (formatters.has(zone)) return formatters.get(zone) ?? null;
  let formatter: Intl.DateTimeFormat | null = null;
  if (zone.length <= MAX_TIME_ZONE_LENGTH && NAME_SHAPE.test(zone)) {
    try {
      formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: zone,
        hourCycle: "h23",
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
      });
    } catch {
      formatter = null; // not a time zone name
    }
  }
  // Only names that were found are remembered: a stream of made-up names must not grow the table.
  if (formatter) formatters.set(zone, formatter);
  return formatter;
}

/// Whether `value` names a time zone this server knows (and so can be stored and used). Exact: no trimming, so what is stored is what was checked.
export function isSchoolTimeZone(value: unknown): value is string {
  return typeof value === "string" && isKnown(value);
}

const isKnown = (name: string): boolean => name.length > 0 && formatterFor(name) !== null;

/// The zone a school's day follows: the stored value when it names a time zone, else "UTC". Warns once per bad value.
export function resolveSchoolTimeZone(stored: string | null | undefined): string {
  if (stored === null || stored === undefined) return DEFAULT_SCHOOL_TIME_ZONE;
  if (isKnown(stored)) return stored;
  if (!warned.has(stored) && warned.size < 100) {
    warned.add(stored);
    console.warn(`[school time zone] "${stored.slice(0, MAX_TIME_ZONE_LENGTH)}" is not a time zone name; this school's day follows UTC.`);
  }
  return DEFAULT_SCHOOL_TIME_ZONE;
}

/// The wall-clock fields of `at` in a zone, written as a UTC time (so the difference from `at` is the zone's offset at that instant).
function wallClock(formatter: Intl.DateTimeFormat, at: Date): { year: number; month: number; day: number; asUtc: number } {
  const p: Record<string, number> = {};
  for (const part of formatter.formatToParts(at)) if (part.type !== "literal") p[part.type] = Number(part.value);
  const asUtc = Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!, p.second!);
  return { year: p.year!, month: p.month!, day: p.day!, asUtc };
}

const offsetMs = (formatter: Intl.DateTimeFormat, at: Date): number =>
  wallClock(formatter, at).asUtc - Math.floor(at.getTime() / 1000) * 1000;

/// The instant the school's day containing `now` started: midnight in the school's time zone (a stored value, resolved here; "UTC" when it is not one).
export function startOfSchoolDay(now: Date = new Date(), zone: string | null | undefined = DEFAULT_SCHOOL_TIME_ZONE): Date {
  const resolved = resolveSchoolTimeZone(zone);
  const formatter = resolved === DEFAULT_SCHOOL_TIME_ZONE ? null : formatterFor(resolved);
  if (!formatter) return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const { year, month, day } = wallClock(formatter, now);
  const midnight = Date.UTC(year, month - 1, day); // the local midnight, read as if it were UTC
  const first = midnight - offsetMs(formatter, new Date(midnight));
  // The offset at that first guess can differ from the one at midnight itself (a changeover in between), so take it once more from the guess.
  return new Date(midnight - offsetMs(formatter, new Date(first)));
}
