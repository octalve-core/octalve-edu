/// An on/off switch: a real <button role="switch" aria-checked>, named by a <label htmlFor> that points at its `id` (or by `aria-label`). The button is 44 x 44 CSS px
/// (the size every control holds on a phone); the track drawn inside it is the familiar 44 x 24. Space and Enter toggle it, as for any button.
export function Switch({
  id,
  checked,
  onChange,
  disabled,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
}: {
  id?: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  "aria-label"?: string;
  "aria-describedby"?: string;
}) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      disabled={disabled}
      onClick={onChange}
      className="group inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? "bg-brand" : "bg-line"}`}>
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-surface shadow-sm transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`}
        />
      </span>
    </button>
  );
}
