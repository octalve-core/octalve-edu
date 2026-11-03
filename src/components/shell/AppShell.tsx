import type { ReactNode } from "react";
import { SessionRevalidator } from "@/components/auth/SessionRevalidator";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { brand } from "@/lib/brand";
import type { SupportBannerData } from "@/lib/support/session";
import { BrandMark } from "./BrandMark";
import { Breadcrumb } from "./Breadcrumb";
import { MobileNav } from "./MobileNav";
import { ProfileMenu } from "./ProfileMenu";
import { SchoolSwitcher } from "./SchoolSwitcher";
import { ShellProvider } from "./ShellProvider";
import { SidebarFrame, SidebarProvider } from "./SidebarFrame";
import { SidebarNav } from "./SidebarNav";
import { SupportBanner } from "./SupportBanner";
import { SidebarPerson } from "./SidebarPerson";
import { QuickToolsTrigger } from "@/components/tools/QuickToolsTrigger";
import type { SectionId, ShellSchool } from "./nav";

export type ShellUser = { name: string | null; email: string | null };

/// The signed-in app's frame, from the design artifact ("same shell, one brand tweak" — ported from AlEemaan's):
///  - `lg` and up: a 248 px sidebar (brand, school, navigation in foldable sections, the signed-in person pinned at its
///    foot) that the person can fold to a 64 px rail of icons, and a 60 px top bar (breadcrumb, theme toggle, account menu);
///  - below `lg`: a compact top bar and a floating bottom tab bar with a "More" sheet — the page reserves room for it,
///    so it never covers content.
/// Unlike AlEemaan's, this shell is **school-aware**: the navigation follows the school the path is in (see
/// `ShellProvider`). A skip link is the first thing in the tab order. Every page inside is still responsible for its own
/// session and school check; the shell only displays who is signed in and which schools they belong to.
export function AppShell({
  user,
  schools,
  platform = false,
  support = null,
  sidebarCollapsed = false,
  foldedSections = [],
  children,
}: {
  user: ShellUser;
  schools: readonly ShellSchool[];
  /// The person is a platform administrator: the navigation gets a "Platform" link (display only).
  platform?: boolean;
  /// A support view is open on this sign-in (ADR 0017): the banner is drawn above the page.
  support?: SupportBannerData | null;
  /// The remembered choices (cookies, read by the layout) so the first paint has the right width and the right folded sections.
  sidebarCollapsed?: boolean;
  foldedSections?: readonly SectionId[];
  children: ReactNode;
}) {
  return (
    <ShellProvider schools={schools} platform={platform}>
      <SidebarProvider initialCollapsed={sidebarCollapsed} initialFolded={foldedSections}>
        <SessionRevalidator />
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-brand-strong focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-white"
        >
          Skip to content
        </a>

        <SidebarFrame top={<SchoolSwitcher />} foot={<SidebarPerson name={user.name} email={user.email} />}>
          <SidebarNav />
        </SidebarFrame>

        <div className="transition-[padding] duration-200 motion-reduce:transition-none lg:pl-62 lg:group-data-[sidebar=collapsed]/shell:pl-16">
          {support && <SupportBanner name={support.name} areas={support.areas} endsAt={support.endsAt} />}
          <header className="sticky top-0 z-20 flex h-15 items-center justify-between gap-4 border-b border-line bg-canvas px-4 sm:px-6">
            <div className="flex items-center gap-2.5 lg:hidden">
              <BrandMark size="sm" />
              <span className="text-base font-bold tracking-tight text-fg">{brand.name}</span>
            </div>
            <div className="hidden min-w-0 lg:block">
              <Breadcrumb />
            </div>

            <div className="flex items-center gap-2">
              <ThemeToggle />
              <ProfileMenu name={user.name} email={user.email} />
            </div>
          </header>

          {/* pb-32 on phones: the floating tab bar (~72 px + its 12 px gap + the safe area) must never cover the last
              thing on the page. */}
          <main id="main" tabIndex={-1} className="mx-auto w-full max-w-5xl px-4 py-8 pb-32 focus:outline-none sm:px-6 lg:py-10 lg:pb-12">
            {children}
          </main>
        </div>

        <MobileNav name={user.name} email={user.email} />
        <QuickToolsTrigger />
      </SidebarProvider>
    </ShellProvider>
  );
}
