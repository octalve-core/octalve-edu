import { GraduationCapIcon } from "@/components/ui/icons";
import { SignOutButton } from "./SignOutButton";

/// Top bar for signed-in screens. Becomes the real app shell's header in
/// Phase 1; for now it carries the brand, who is signed in, and sign-out.
export function AppHeader({ name, email }: { name: string | null; email: string | null }) {
  return (
    <header className="sticky top-0 z-10 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white"
          >
            <GraduationCapIcon className="h-5 w-5" />
          </span>
          <span className="text-base font-bold tracking-tight text-white">Octalve Edu</span>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden min-w-0 text-right sm:block">
            {name && <p className="truncate text-sm font-medium text-white">{name}</p>}
            {email && <p className="truncate text-xs text-slate-400">{email}</p>}
          </div>
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
