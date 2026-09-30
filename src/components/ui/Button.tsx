import type { ButtonHTMLAttributes } from "react";
import { SpinnerIcon } from "./icons";

type Variant = "primary" | "secondary" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-blue-600 text-white shadow-lg shadow-blue-950/40 hover:bg-blue-500 active:bg-blue-600 disabled:bg-slate-800 disabled:text-slate-500 disabled:shadow-none",
  secondary:
    "border border-slate-700 bg-slate-900 text-slate-100 hover:border-slate-600 hover:bg-slate-800 disabled:text-slate-500",
  ghost: "text-slate-300 hover:bg-slate-800/70 hover:text-white disabled:text-slate-600",
};

export function Button({
  variant = "primary",
  loading = false,
  className = "",
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {loading && <SpinnerIcon className="h-4 w-4 motion-safe:animate-spin" />}
      {children}
    </button>
  );
}
