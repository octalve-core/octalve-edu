import { useId, type InputHTMLAttributes, type ReactNode, type Ref } from "react";

export type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  label: string;
  id?: string;
  hint?: string;
  error?: string | null;
  /// Rendered inside the input's right edge (e.g. a show/hide button).
  trailing?: ReactNode;
  ref?: Ref<HTMLInputElement>;
};

/// A labelled text input with the accessibility wiring done once, correctly:
/// a real <label htmlFor>, hint/error linked via aria-describedby, and
/// aria-invalid when there is an error. Callers pass `autoComplete`,
/// `inputMode` etc. straight through.
export function TextField({
  label,
  id,
  hint,
  error,
  trailing,
  className = "",
  ref,
  ...rest
}: TextFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ");

  return (
    <div>
      <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-slate-200">
        {label}
      </label>
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className={`w-full rounded-xl border bg-slate-950 px-4 py-3 text-sm text-white placeholder:text-slate-500 transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60 ${
            error
              ? "border-rose-500/60 focus-visible:border-rose-400 focus-visible:ring-rose-500/30"
              : "border-slate-800 hover:border-slate-700 focus-visible:border-blue-500 focus-visible:ring-blue-500/30"
          } ${trailing ? "pr-12" : ""} ${className}`}
          {...rest}
        />
        {trailing && <div className="absolute inset-y-0 right-1 flex items-center">{trailing}</div>}
      </div>
      {hint && !error && (
        <p id={hintId} className="mt-1.5 text-xs text-slate-400">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1.5 text-xs font-medium text-rose-400">
          {error}
        </p>
      )}
    </div>
  );
}
