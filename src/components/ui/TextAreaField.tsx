import { useId, type Ref, type TextareaHTMLAttributes } from "react";

export type TextAreaFieldProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> & {
  label: string;
  id?: string;
  hint?: string;
  error?: string | null;
  ref?: Ref<HTMLTextAreaElement>;
};

/// A labelled multi-line input wired like TextField: a real <label htmlFor>, hint and error linked by aria-describedby, aria-invalid on error.
export function TextAreaField({ label, id, hint, error, className = "", ref, ...rest }: TextAreaFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ");

  return (
    <div>
      <label htmlFor={inputId} className="mb-1.5 block text-xs font-semibold tracking-wide text-fg-2 uppercase">
        {label}
      </label>
      <textarea
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={`w-full resize-y rounded-xl border bg-field px-4 py-3 text-sm text-fg placeholder:text-fg-muted transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60 ${
          error
            ? "border-danger-icon/60 focus-visible:border-danger-icon focus-visible:ring-danger-icon/30"
            : "border-line hover:border-line-strong focus-visible:border-ring focus-visible:ring-ring/30"
        } ${className}`}
        {...rest}
      />
      {hint && !error && (
        <p id={hintId} className="mt-1.5 text-xs text-fg-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1.5 text-xs font-medium text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}
