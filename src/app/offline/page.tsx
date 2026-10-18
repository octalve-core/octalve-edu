import Link from "next/link";

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-4 py-12 text-center">
      <div className="mx-auto max-w-md rounded-2xl border border-line bg-surface p-8 shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
          <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 4.243a9 9 0 01-12.728 0m0 0l2.829-2.829m-2.829 2.829L3 21m2.828-5.657a5 5 0 010-7.072m0 0l2.829 2.829"
            />
          </svg>
        </div>

        <h1 className="mt-5 text-lg font-bold text-fg">You are currently offline</h1>
        <p className="mt-2 text-xs leading-relaxed text-fg-muted">
          Octalve Edu is operating in offline mode. You can still use the <strong>Quick Tools</strong> floating dock to perform
          calculations, take memos, and record offline cash/POS receipts.
        </p>

        <div className="mt-4 rounded-xl border border-line bg-canvas p-3 text-left text-xs text-fg-muted">
          <p className="font-semibold text-fg">Automatic Syncing</p>
          <p className="mt-0.5 text-[11px]">
            Any manual payments logged while offline are stored securely in your browser and will automatically synchronize when your
            internet reconnects.
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-xl bg-brand px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand/90 transition-colors"
          >
            Try Reconnecting
          </Link>
        </div>
      </div>
    </div>
  );
}
