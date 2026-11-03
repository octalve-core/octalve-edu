import type { ComponentType, SVGProps } from "react";
import type { Role } from "@prisma/client";
import {
  BookOpenIcon,
  BuildingIcon,
  CalendarIcon,
  FileTextIcon,
  GraduationCapIcon,
  HomeIcon,
  MailIcon,
  SlidersIcon,
  UsersIcon,
} from "@/components/ui/icons";
import { isValidTenantCode } from "@/lib/tenant/validate-code";

/// A school the signed-in person belongs to, as the shell needs it. Display data only (see lib/auth/page-session.ts).
export type ShellSchool = { code: string; name: string; role: Role };

export type NavItem = {
  label: string;
  /// null → not built yet: shown as visibly-disabled text with a "Soon" tag, never as a link
  /// (a link to nothing would be a lie).
  href: string | null;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /// Active only on exactly this path (an Overview link is a prefix of every other page in its school).
  exact?: boolean;
  /// The sidebar section this page belongs to; no section = listed on its own, at the top (Overview, My work, …). The order of the list
  /// is NOT the order of the sections: `SECTIONS` is. (The phone's tab bar keeps the order of the list.)
  section?: SectionId;
};

/// The sidebar's sections, in the order they are shown. The ids are what the "folded sections" cookie stores, so renaming one only
/// forgets a folded state. "Platform" is a section of one entry, which is how that link ends up last, as a plain link.
export const SECTIONS = [
  { id: "administration", label: "Administration" },
  { id: "learning", label: "Learning" },
  { id: "platform", label: "Platform" },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];

/// The single source of truth for navigation: the sidebar, the phone tab bar and the "More" sheet are all derived
/// from this, so they can't disagree. `school` is the school being looked at (or the person's only school, when they
/// are on a page outside one); without it the person has a school to choose first.
/// Hiding an entry is a courtesy: the page and the API behind it decide.
export function navFor(school: ShellSchool | null, platform = false): NavItem[] {
  const platformItem: NavItem[] = platform ? [{ label: "Platform", href: "/platform", icon: BuildingIcon, section: "platform" }] : [];
  if (!school) return [{ label: "Your schools", href: "/dashboard", icon: HomeIcon, exact: true }, ...platformItem];
  const items: NavItem[] = [{ label: "Overview", href: `/schools/${school.code}`, icon: HomeIcon, exact: true }];
  if (school.role === "ADMIN") {
    items.push(
      { label: "Academics", href: `/schools/${school.code}/academics`, icon: CalendarIcon, section: "administration" },
      { label: "People", href: `/schools/${school.code}/people`, icon: GraduationCapIcon, section: "administration" },
      { label: "Communication", href: `/schools/${school.code}/communication`, icon: MailIcon, section: "administration" },
      { label: "Users", href: `/schools/${school.code}/users`, icon: UsersIcon, section: "administration" },
      { label: "Question bank", href: `/schools/${school.code}/question-bank`, icon: FileTextIcon, section: "learning" },
      { label: "Forms", href: `/schools/${school.code}/forms`, icon: BookOpenIcon, section: "learning" },
      { label: "Settings", href: `/schools/${school.code}/settings`, icon: SlidersIcon, section: "administration" },
    );
  } else if (school.role === "CAMPUS_ADMIN") {
    // A campus administrator runs their own campus: no school Settings (the school's name, type and campuses are the school administrator's).
    items.push(
      { label: "Academics", href: `/schools/${school.code}/academics`, icon: CalendarIcon, section: "administration" },
      { label: "People", href: `/schools/${school.code}/people`, icon: GraduationCapIcon, section: "administration" },
      { label: "Communication", href: `/schools/${school.code}/communication`, icon: MailIcon, section: "administration" },
      { label: "Users", href: `/schools/${school.code}/users`, icon: UsersIcon, section: "administration" },
      { label: "Question bank", href: `/schools/${school.code}/question-bank`, icon: FileTextIcon, section: "learning" },
      { label: "Forms", href: `/schools/${school.code}/forms`, icon: BookOpenIcon, section: "learning" },
    );
  } else if (school.role === "TEACHING_STAFF" || school.role === "NON_TEACHING_STAFF") {
    // Staff may look at the school year and at the school's people (read-only; plan 1.2, decisions P2 and P9) — they change none of it.
    items.push(
      { label: "Academics", href: `/schools/${school.code}/academics`, icon: CalendarIcon, section: "administration" },
      { label: "People", href: `/schools/${school.code}/people`, icon: GraduationCapIcon, section: "administration" },
      // Staff write and browse questions here; whether they may review is decided on the page.
      { label: "Question bank", href: `/schools/${school.code}/question-bank`, icon: FileTextIcon, section: "learning" },
    );
    // Teachers write and mark forms; non-teaching staff only answer the questionnaires addressed to them. Both reach the page; what each may do is decided there and by the API.
    items.push({ label: "Forms", href: `/schools/${school.code}/forms`, icon: BookOpenIcon, section: "learning" });
  } else if (school.role === "STUDENT") {
    // A pupil's own work: the practice sets, questionnaires and paper work set for them, and the question practice they do for themselves.
    items.push({ label: "My work", href: `/schools/${school.code}/learn`, icon: BookOpenIcon });
  } else if (school.role === "PARENT") {
    // A guardian looks at how their children's practice is going, as far as the school lets them.
    items.push({ label: "My children", href: `/schools/${school.code}/children`, icon: GraduationCapIcon });
  }
  return [...items, ...platformItem];
}

export type NavGroup = {
  /// null = no heading: the entries listed on their own, or a section that has just one visible entry (a section of one is a plain link).
  section: { id: SectionId; label: string } | null;
  items: NavItem[];
};

/// The visible entries as the sidebar and the phone's More sheet show them: entries with no section first, then each section that has
/// entries, in the order of `SECTIONS`. A section with exactly one entry comes out without a heading (nothing to fold), and a section
/// with none is dropped. Pure, so it is tested without a browser.
export function groupNav(items: readonly NavItem[]): NavGroup[] {
  const groups: NavGroup[] = [];
  const loose = items.filter((item) => !item.section);
  if (loose.length > 0) groups.push({ section: null, items: loose });
  for (const section of SECTIONS) {
    const inSection = items.filter((item) => item.section === section.id);
    if (inSection.length === 0) continue;
    groups.push({ section: inSection.length === 1 ? null : section, items: inSection });
  }
  return groups;
}

/// The section the current page belongs to, or null (no section, or no entry for the path). Used to open the folded section that holds it.
export function sectionOfPath(pathname: string, items: readonly NavItem[]): SectionId | null {
  return items.find((item) => isActive(pathname, item))?.section ?? null;
}

/// Which of the person's schools the path names, if any. **For display only** — which links to draw. A path naming a
/// school the person is not in matches nothing (and the page behind it answers 403 on its own); the code is matched
/// the way the resolver matches it (trimmed, lower-cased), so `/schools/ABC` and `/schools/abc` highlight the same.
export function schoolFromPath(pathname: string, schools: readonly ShellSchool[]): ShellSchool | null {
  const match = /^\/schools\/([^/]+)(?:\/|$)/.exec(pathname);
  if (!match) return null;
  let code: string;
  try {
    code = decodeURIComponent(match[1]).trim().toLowerCase();
  } catch {
    return null; // a malformed escape is not a school
  }
  if (!isValidTenantCode(code)) return null;
  return schools.find((school) => school.code === code) ?? null;
}

/// The page's own name for the breadcrumb ("School / Users"), by path.
const SCHOOL_PAGES: Record<string, string> = {
  "": "Overview",
  users: "Users",
  academics: "Academics",
  people: "People",
  communication: "Communication",
  "question-bank": "Question bank",
  forms: "Forms",
  learn: "My work",
  children: "My children",
  settings: "Settings",
  support: "Support access",
};
const GLOBAL_PAGES: Record<string, string> = { "/dashboard": "Your schools", "/account": "Account", "/platform": "Platform" };

export function pageLabel(pathname: string): string | null {
  const own = GLOBAL_PAGES[pathname.replace(/\/+$/, "") || "/"];
  if (own) return own;
  const match = /^\/schools\/[^/]+(?:\/([^/]+))?\/?$/.exec(pathname);
  if (match) return SCHOOL_PAGES[match[1] ?? ""] ?? null;
  // A person's own page under People (a student or a member of staff) is still "People" in the breadcrumb.
  if (/^\/schools\/[^/]+\/people\/(?:students|staff)\/[^/]+\/?$/.test(pathname)) return "People";
  // A form's own page is still "Forms" in the breadcrumb.
  if (/^\/schools\/[^/]+\/forms\/[^/]+\/?$/.test(pathname)) return "Forms";
  // Sub-pages under Communication are still "Communication" in the breadcrumb.
  if (/^\/schools\/[^/]+\/communication(?:\/.*)?$/.test(pathname)) return "Communication";
  return null;
}

export const isActive = (pathname: string, item: Pick<NavItem, "href" | "exact">): boolean => {
  if (!item.href) return false;
  const path = pathname.replace(/\/+$/, "") || "/";
  return path === item.href || (!item.exact && path.startsWith(`${item.href}/`));
};

/// One focus style for every shell control: a solid 2px ring in the brand's light colour,
/// offset from the edge so it reads on any surface in either theme.
export const FOCUS_RING = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/// "Amina Yusuf" → "AY"; "Amina" → "A"; with no name, the first word of the email's local part.
export function initialsOf(name: string | null, email: string | null): string {
  const words = (name?.trim() || email?.split("@")[0] || "?").split(/[\s._-]+/).filter(Boolean);
  const picked = words.length > 1 ? [words[0], words[words.length - 1]] : [words[0] ?? "?"];
  return picked
    .map((word) => Array.from(word)[0]) // Array.from: don't split a surrogate pair in half
    .join("")
    .toUpperCase();
}
