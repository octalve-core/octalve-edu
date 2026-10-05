import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getUserMemberships } from "@/lib/auth/memberships";
import { ROLE_LABELS } from "@/lib/roles";
import { AppHeader } from "@/components/auth/AppHeader";
import { SessionRevalidator } from "@/components/auth/SessionRevalidator";
import { ChevronRightIcon, GraduationCapIcon } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

// The front door (PRD §7, domain-implementation-plan.md §0.5.2): after sign-in a person lands here and is routed to
// their school — one school goes straight in, several get a picker, none get an honest "ask your administrator".
// The list comes from the person's OWN memberships (read through the user context); the link carries the school's
// code, which the school pages then verify against that same membership again — the picker grants nothing.
export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const memberships = await getUserMemberships(session.userId);
  if (memberships.length === 1) redirect(`/schools/${memberships[0].tenantCode}`);

  const displayName = session.user.name?.trim() || session.user.email || "there";
  const firstName = displayName.split(/\s+/)[0];

  return (
    <div className="min-h-screen bg-canvas text-fg-2">
      <SessionRevalidator />
      <AppHeader name={session.user.name} email={session.user.email} />

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        <h1 className="text-3xl font-bold tracking-tight text-fg">Welcome, {firstName}</h1>
        <p className="mt-2 text-base text-fg-muted">
          {memberships.length > 0
            ? "Choose a school to open."
            : "You're signed in, but you aren't a member of any school yet."}
        </p>

        <section aria-labelledby="schools-heading" className="mt-10">
          <h2 id="schools-heading" className="text-sm font-semibold tracking-wider text-fg-muted uppercase">
            Your schools
          </h2>

          {memberships.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-fg-muted">
              Ask your school administrator to invite you.
            </p>
          ) : (
            <ul className="mt-4 grid gap-4 sm:grid-cols-2">
              {memberships.map((m) => (
                <li key={m.tenantId}>
                  <Link
                    href={`/schools/${m.tenantCode}`}
                    className="flex min-h-11 items-start gap-4 rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-line-strong hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand-fg">
                      <GraduationCapIcon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-fg">{m.tenantName}</span>
                      <span className="mt-0.5 block text-sm text-fg-muted">{ROLE_LABELS[m.role]}</span>
                      <span className="mt-2 block font-mono text-xs text-fg-muted">{m.tenantCode}</span>
                    </span>
                    <ChevronRightIcon className="mt-1 h-5 w-5 shrink-0 text-fg-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
