import type { ReactNode } from "react";
import { AlertTriangleIcon, CheckCircleIcon, InfoIcon } from "./icons";

type Variant = "error" | "warning" | "info" | "success";

const STYLES: Record<Variant, { box: string; icon: string; Icon: typeof InfoIcon }> = {
  error: {
    box: "border-rose-500/30 bg-rose-500/10 text-rose-100",
    icon: "text-rose-400",
    Icon: AlertTriangleIcon,
  },
  warning: {
    box: "border-amber-500/30 bg-amber-500/10 text-amber-100",
    icon: "text-amber-400",
    Icon: AlertTriangleIcon,
  },
  info: {
    box: "border-sky-500/30 bg-sky-500/10 text-sky-100",
    icon: "text-sky-400",
    Icon: InfoIcon,
  },
  success: {
    box: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
    icon: "text-emerald-400",
    Icon: CheckCircleIcon,
  },
};

/// Errors and warnings use role="alert" (announced immediately by screen
/// readers); info/success use role="status" (announced politely, without
/// interrupting). Never rely on colour alone — every variant also has an icon
/// and readable text.
export function Alert({
  variant,
  title,
  children,
  className = "",
  id,
}: {
  variant: Variant;
  title?: string;
  children?: ReactNode;
  className?: string;
  id?: string;
}) {
  const { box, icon, Icon } = STYLES[variant];
  const assertive = variant === "error" || variant === "warning";

  return (
    <div
      id={id}
      role={assertive ? "alert" : "status"}
      className={`flex gap-3 rounded-xl border p-4 text-sm leading-relaxed ${box} ${className}`}
    >
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${icon}`} />
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? "mt-0.5 opacity-90" : ""}>{children}</div>}
      </div>
    </div>
  );
}
