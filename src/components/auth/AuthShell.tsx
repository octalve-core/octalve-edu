import type { ReactNode } from "react";
import { GraduationCapIcon, ShieldCheckIcon } from "@/components/ui/icons";

/// Split-screen shell shared by every signed-out screen (/login, /setup):
/// a brand panel on large screens, collapsing to a compact brand header above
/// the form on small ones. The form side is the only landmark that matters
/// for assistive tech, so the brand panel is decorative (aria-hidden).
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside
        aria-hidden="true"
        className="relative hidden overflow-hidden border-r border-slate-800/80 bg-slate-900 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:justify-between lg:self-start lg:p-12"
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(60% 50% at 15% 0%, rgba(37,99,235,0.38), transparent 70%), radial-gradient(50% 40% at 100% 100%, rgba(16,185,129,0.18), transparent 70%)",
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            maskImage: "radial-gradient(ellipse at 30% 20%, black, transparent 75%)",
            WebkitMaskImage: "radial-gradient(ellipse at 30% 20%, black, transparent 75%)",
          }}
        />

        <div className="relative flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-950/50">
            <GraduationCapIcon className="h-5 w-5" />
          </span>
          <span className="text-lg font-bold tracking-tight text-white">Octalve Edu</span>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-4xl leading-tight font-bold tracking-tight text-white">
            Run your school with confidence.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-slate-300">
            Student records, results and fees in one secure workspace — with every person seeing
            only what they should.
          </p>
        </div>

        <div className="relative flex items-center gap-2 text-sm text-slate-400">
          <ShieldCheckIcon className="h-4 w-4 text-emerald-400" />
          Built for schools. Secured by design.
        </div>
      </aside>

      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span
              aria-hidden="true"
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white"
            >
              <GraduationCapIcon className="h-5 w-5" />
            </span>
            <span className="text-lg font-bold tracking-tight text-white">Octalve Edu</span>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
