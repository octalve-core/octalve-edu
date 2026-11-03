import { STATUS_LABEL, type FormStatusKey } from "@/components/forms/model";

const STATUS_STYLE: Record<FormStatusKey, string> = {
  DRAFT: "border-line-strong text-fg-2",
  PUBLISHED: "border-ok-line bg-ok-bg text-ok-fg",
  CLOSED: "border-line-strong bg-surface-2 text-fg-muted",
  ARCHIVED: "border-line-strong bg-surface-2 text-fg-muted",
};

/// The state of a form as a pill: the list and the form's own page say it the same way.
export function StatusBadge({ status }: { status: FormStatusKey }) {
  return (
    <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>
  );
}
