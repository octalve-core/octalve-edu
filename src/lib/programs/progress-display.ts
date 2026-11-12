// Progress records, slice R4 (task 0027 (progress records), section 10): how a record is SHOWN - Arabic and English, Gregorian and Hijri dates, the digits. Pure: no database, no clock, no React.
// What is stored never changes; this only decides the words, the calendar and the digits on the screen and in the print sheet.

export const LANGS = ["en", "ar", "both"] as const;
export const CALENDARS = ["gregorian", "hijri", "both"] as const;
export const DIGITS = ["western", "arabic"] as const;
export type Lang = (typeof LANGS)[number];
export type CalendarMode = (typeof CALENDARS)[number];
export type DigitMode = (typeof DIGITS)[number];
export type Display = { lang: Lang; calendar: CalendarMode; digits: DigitMode };
export const DEFAULT_DISPLAY: Display = { lang: "en", calendar: "gregorian", digits: "western" };

const oneOf = <T extends string>(list: readonly T[], value: unknown, fallback: T): T =>
  typeof value === "string" && (list as readonly string[]).includes(value) ? (value as T) : fallback;

/// Whatever was kept on the device (or nothing, or junk) -> a valid choice. Never throws.
export function parseDisplay(raw: unknown): Display {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return DEFAULT_DISPLAY;
    }
  }
  if (!value || typeof value !== "object") return DEFAULT_DISPLAY;
  const v = value as Record<string, unknown>;
  return {
    lang: oneOf(LANGS, v.lang, DEFAULT_DISPLAY.lang),
    calendar: oneOf(CALENDARS, v.calendar, DEFAULT_DISPLAY.calendar),
    digits: oneOf(DIGITS, v.digits, DEFAULT_DISPLAY.digits),
  };
}

/// A text in English and in Arabic. `ar` is null for words somebody typed: they are shown as typed, once, and never changed.
export type Bi = { en: string; ar: string | null };
export const bi = (en: string, ar: string | null = null): Bi => ({ en, ar });

const ARABIC_ZERO = 0x0660;
/// "6 Nov 2026" -> "٦ Nov ٢٠٢٦": only the digits change.
export const toArabicDigits = (text: string): string => text.replace(/[0-9]/g, (d) => String.fromCharCode(ARABIC_ZERO + Number(d)));
export const arabicText = (text: string, digits: DigitMode): string => (digits === "arabic" ? toArabicDigits(text) : text);

/// Which languages the viewer wants shown, in order (English first when both).
export const langsOf = (display: Display): ("en" | "ar")[] => (display.lang === "both" ? ["en", "ar"] : [display.lang]);

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Names

export const WEEKDAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const WEEKDAYS_AR = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"] as const;
export const GREGORIAN_MONTHS_AR = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
] as const;
export const HIJRI_MONTHS_EN = [
  "Muharram",
  "Safar",
  "Rabi' I",
  "Rabi' II",
  "Jumada I",
  "Jumada II",
  "Rajab",
  "Sha'ban",
  "Ramadan",
  "Shawwal",
  "Dhu al-Qi'dah",
  "Dhu al-Hijjah",
] as const;
export const HIJRI_MONTHS_AR = [
  "محرم",
  "صفر",
  "ربيع الأول",
  "ربيع الآخر",
  "جمادى الأولى",
  "جمادى الآخرة",
  "رجب",
  "شعبان",
  "رمضان",
  "شوال",
  "ذو القعدة",
  "ذو الحجة",
] as const;

const GREGORIAN_EN = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const utcNoon = (iso: string): Date | null => {
  const m = ISO.exec(iso);
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  // Date.UTC rolls an impossible day over (month 13, the 31st of April): that is not a day, so it has no date to show.
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
};

export type HijriDate = { year: number; month: number; day: number };
let HIJRI: Intl.DateTimeFormat | null | undefined;
const hijriFormatter = (): Intl.DateTimeFormat | null => {
  if (HIJRI !== undefined) return HIJRI;
  try {
    HIJRI = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura-nu-latn", {
      day: "numeric",
      month: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
    const probe = HIJRI.formatToParts(new Date(Date.UTC(2026, 10, 8, 12))).find((p) => p.type === "year")?.value;
    if (probe !== "1448") HIJRI = null; // the platform has no Umm al-Qura calendar: leave the Hijri date out rather than show a wrong one
  } catch {
    HIJRI = null;
  }
  return HIJRI;
};

/// The Hijri date (Umm al-Qura) of a calendar day, moved by the program's adjustment in days. Null when the platform cannot calculate it.
export function hijriOf(iso: string, adjust = 0): HijriDate | null {
  const date = utcNoon(iso);
  const formatter = hijriFormatter();
  if (!date || !formatter) return null;
  date.setUTCDate(date.getUTCDate() + Math.trunc(adjust));
  const part = (type: string) => Number(formatter.formatToParts(date).find((p) => p.type === type)?.value);
  const result = { year: part("year"), month: part("month"), day: part("day") };
  return Number.isFinite(result.year) && result.month >= 1 && result.month <= 12 && Number.isFinite(result.day) ? result : null;
}

export const weekdayIndex = (iso: string): number => utcNoon(iso)?.getUTCDay() ?? 0;

/// One calendar day in both languages. Digits are Western here; the screen converts the Arabic side when the viewer asks for Arabic-Indic digits.
export function dateBi(iso: string, opts: { calendar: CalendarMode; adjust?: number; weekday?: boolean }): Bi {
  const date = utcNoon(iso);
  if (!date) return bi(iso, iso);
  const day = weekdayIndex(iso);
  const gEn = `${opts.weekday ? `${WEEKDAYS_EN[day]} ` : ""}${GREGORIAN_EN.format(date)}`;
  const gAr = `${opts.weekday ? `${WEEKDAYS_AR[day]} ` : ""}${date.getUTCDate()} ${GREGORIAN_MONTHS_AR[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
  const h = opts.calendar === "gregorian" ? null : hijriOf(iso, opts.adjust ?? 0);
  const hEn = h ? `${h.day} ${HIJRI_MONTHS_EN[h.month - 1]} ${h.year} AH` : null;
  const hAr = h ? `${h.day} ${HIJRI_MONTHS_AR[h.month - 1]} ${h.year} هـ` : null;
  if (opts.calendar === "hijri" && hEn && hAr) {
    const prefix = opts.weekday ? [`${WEEKDAYS_EN[day]} `, `${WEEKDAYS_AR[day]} `] : ["", ""];
    return { en: `${prefix[0]}${hEn}`, ar: `${prefix[1]}${hAr}` };
  }
  if (opts.calendar === "both" && hEn && hAr) return { en: `${gEn} · ${hEn}`, ar: `${gAr} · ${hAr}` };
  return { en: gEn, ar: gAr };
}

/// "6 Nov 2026 to 12 Nov 2026" in both languages.
export const rangeBi = (from: Bi, to: Bi): Bi => ({
  en: `${from.en} to ${to.en}`,
  ar: from.ar !== null && to.ar !== null ? `${from.ar} إلى ${to.ar}` : null,
});

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// The words of the module (one catalogue, English and Arabic; the Arabic is reviewed by an Arabic reader before release)

export const MESSAGES = {
  draft: bi("Draft", "مسودة"),
  submitted: bi("Handed in", "مُسلَّم للمراجعة"),
  verified: bi("Verified", "موثَّق"),
  nothingYet: bi("Nothing here yet.", "لا يوجد شيء بعد."),
  nothingVerified: bi("Nothing verified yet.", "لم يُوثَّق شيء بعد."),
  thisMonth: bi("This month so far", "هذا الشهر حتى الآن"),
  profile: bi("Profile", "البيانات الشخصية"),
  guardian: bi("Guardian", "ولي الأمر"),
  group: bi("Group", "المجموعة"),
  program: bi("Program", "البرنامج"),
  period: bi("Period", "الفترة"),
  date: bi("Date", "التاريخ"),
  status: bi("Status", "الحالة"),
  printedOn: bi("Printed on", "تاريخ الطباعة"),
  lastSavedBy: bi("Last saved by", "آخر حفظ بواسطة"),
  verifiedBy: bi("Verified by", "وثّقه"),
  returned: bi("Returned", "أُعيد"),
  weekOf: (date: Bi): Bi => bi(`Week of ${date.en}`, date.ar === null ? null : `أسبوع ${date.ar}`),
  daysRecorded: (n: number): Bi => bi(`${n} ${n === 1 ? "day" : "days"} recorded`, `عدد الأيام المسجلة: ${n}`),
  trackLine: (label: Bi, parts: { days: number; ayat: number | null; from: Bi | null; to: Bi | null; average: number | null }): Bi => {
    const en = [`${parts.days} ${parts.days === 1 ? "day" : "days"}`];
    const ar = [`عدد الأيام ${parts.days}`];
    if (parts.ayat !== null) {
      en.push(`${parts.ayat} ayat`);
      ar.push(`عدد الآيات ${parts.ayat}`);
    }
    if (parts.from && parts.to) {
      en.push(`from ${parts.from.en} to ${parts.to.en}`);
      ar.push(`من ${parts.from.ar ?? parts.from.en} إلى ${parts.to.ar ?? parts.to.en}`);
    }
    if (parts.average !== null) {
      en.push(`average rating ${parts.average} of 5`);
      ar.push(`متوسط التقدير ${parts.average} من 5`);
    }
    return bi(`${label.en}: ${en.join(", ")}`, `${label.ar ?? label.en}: ${ar.join("، ")}`);
  },
} as const;

export const STATUS_BI: Record<"DRAFT" | "SUBMITTED" | "VERIFIED", Bi> = {
  DRAFT: MESSAGES.draft,
  SUBMITTED: MESSAGES.submitted,
  VERIFIED: MESSAGES.verified,
};

export const PLACE_BI: Record<string, Bi> = {
  ACTIVE: bi("Taking part", "مشارك"),
  SUSPENDED: bi("Suspended", "موقوف"),
  EXPELLED: bi("Expelled", "مفصول"),
  TERMINATED: bi("Terminated", "منتهٍ"),
  ENDED_BY_SCHOOL: bi("Ended by the school", "أنهته المدرسة"),
  WITHDRAWN: bi("Withdrawn", "منسحب"),
  COMPLETED: bi("Completed", "أتمّ البرنامج"),
};

/// The preference is kept on the device under this name.
export const DISPLAY_STORAGE_KEY = "aleemaan.progress.display";
