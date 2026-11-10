import Link from "next/link";
import type { ReactNode } from "react";
import { CalendarIcon, FileTextIcon, GraduationCapIcon, LayersIcon, PrinterIcon, ReceiptIcon, UsersIcon } from "@/components/ui/icons";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { brand } from "@/lib/brand";

// The landing page (task 0041): what a signed-out visitor sees at `/`. A server component that sets nothing and reads nothing but `brand.landing`, so AlEemaan's copy of it needs only its own words.
// Landmarks: header, main, footer. One h1, an h2 for each section, an h3 for each item. Every link says where it goes. The icons are decorative. There is no image, script or font of its own.

type Icon = (props: { className?: string }) => ReactNode;
const ICONS: Record<string, Icon> = {
  people: UsersIcon,
  attendance: CalendarIcon,
  results: FileTextIcon,
  reportCards: PrinterIcon,
  fees: ReceiptIcon,
  yearEnd: LayersIcon,
};

type LandingCopy = {
  eyebrow: string;
  headline: string;
  lead: string;
  coversHeading: string;
  covers: readonly { icon: string; title: string; text: string }[];
  peopleHeading: string;
  people: readonly { who: string; text: string }[];
  howRun?: { heading: string; items: readonly { title: string; text: string }[] };
  closingHeading: string;
  closingText: string;
  /// The public pages worth a link besides sign-in, as a path on this site: the first is the hero's quiet button, and every one is in the footer.
  links: readonly { label: string; href: string }[];
};
const copy: LandingCopy = brand.landing;

const RING = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
const LINK_FILLED = `inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-strong px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-strong/25 transition-colors hover:bg-brand-strong-hover ${RING}`;
const LINK_QUIET = `inline-flex min-h-11 items-center justify-center rounded-xl border border-line-strong bg-surface px-5 py-3 text-sm font-semibold text-fg transition-colors hover:bg-surface-2 ${RING}`;
const FRAME = "mx-auto w-full max-w-6xl px-4 sm:px-8";

export function LandingPage() {
  return (
    <div className="min-h-screen bg-canvas text-fg">
      <header className="border-b border-line">
        <div className={`${FRAME} flex items-center justify-between gap-3 py-3`}>
          <div className="flex min-w-0 items-center gap-3">
            <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-white">
              <GraduationCapIcon className="h-5 w-5" />
            </span>
            <span className="truncate text-lg font-bold tracking-tight">{brand.name}</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle />
            <Link href="/login" className={LINK_QUIET}>
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section aria-labelledby="landing-title" className={`${FRAME} pt-14 pb-16 sm:pt-20 sm:pb-24`}>
          <p className="text-sm font-semibold tracking-wide text-brand-fg uppercase">{copy.eyebrow}</p>
          <h1 id="landing-title" className="mt-4 max-w-3xl text-4xl leading-tight font-bold tracking-tight text-balance sm:text-5xl">
            {copy.headline}
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-fg-2">{copy.lead}</p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link href="/login" className={LINK_FILLED}>
              Sign in
            </Link>
            {copy.links[0] && (
              <Link href={copy.links[0].href} className={LINK_QUIET}>
                {copy.links[0].label}
              </Link>
            )}
          </div>
        </section>

        <section aria-labelledby="landing-covers" className="border-t border-line bg-surface">
          <div className={`${FRAME} py-14 sm:py-20`}>
            <h2 id="landing-covers" className="text-2xl font-bold tracking-tight sm:text-3xl">
              {copy.coversHeading}
            </h2>
            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {copy.covers.map((item) => {
                const Icon = ICONS[item.icon] ?? UsersIcon;
                return (
                  <li key={item.title} className="rounded-2xl border border-line bg-canvas p-6">
                    <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-tint text-brand-fg">
                      <Icon className="h-5 w-5" />
                    </span>
                    <h3 className="mt-4 text-base font-semibold">{item.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-fg-muted">{item.text}</p>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <section aria-labelledby="landing-people" className="border-t border-line">
          <div className={`${FRAME} py-14 sm:py-20`}>
            <h2 id="landing-people" className="text-2xl font-bold tracking-tight sm:text-3xl">
              {copy.peopleHeading}
            </h2>
            <ul className="mt-8 grid gap-x-10 gap-y-6 sm:grid-cols-2">
              {copy.people.map((item) => (
                <li key={item.who}>
                  <h3 className="text-base font-semibold">{item.who}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-fg-muted">{item.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {copy.howRun && (
          <section aria-labelledby="landing-run" className="border-t border-line bg-surface">
            <div className={`${FRAME} py-14 sm:py-20`}>
              <h2 id="landing-run" className="text-2xl font-bold tracking-tight sm:text-3xl">
                {copy.howRun.heading}
              </h2>
              <ul className="mt-8 grid gap-4 sm:grid-cols-2">
                {copy.howRun.items.map((item) => (
                  <li key={item.title} className="rounded-2xl border border-line bg-canvas p-6">
                    <h3 className="text-base font-semibold">{item.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-fg-muted">{item.text}</p>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        <section aria-labelledby="landing-closing" className="relative overflow-hidden bg-brand-deep text-white">
          <div aria-hidden="true" className="brand-pattern pointer-events-none absolute inset-0" />
          <div
            className={`${FRAME} relative flex flex-col items-start gap-6 py-14 sm:flex-row sm:items-center sm:justify-between sm:py-16`}
          >
            <div className="max-w-xl">
              <h2 id="landing-closing" className="text-2xl font-bold tracking-tight sm:text-3xl">
                {copy.closingHeading}
              </h2>
              <p className="mt-2 text-base text-white/85">{copy.closingText}</p>
            </div>
            <Link
              href="/login"
              className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-white px-5 py-3 text-sm font-semibold text-brand-deep transition-colors hover:bg-white/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Sign in
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className={`${FRAME} flex flex-col gap-4 py-8 sm:flex-row sm:items-center sm:justify-between`}>
          <p className="text-sm text-fg-muted">
            © {new Date().getFullYear()} {brand.name}. All rights reserved.
          </p>
          <nav aria-label="Footer">
            <ul className="flex flex-wrap gap-x-6 text-sm font-medium">
              <li>
                <Link
                  href="/login"
                  className={`inline-flex min-h-11 items-center rounded text-fg-2 underline-offset-4 hover:text-fg hover:underline ${RING}`}
                >
                  Sign in
                </Link>
              </li>
              {copy.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className={`inline-flex min-h-11 items-center rounded text-fg-2 underline-offset-4 hover:text-fg hover:underline ${RING}`}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </footer>
    </div>
  );
}
