import { GraduationCapIcon } from "@/components/ui/icons";

/// The product's square mark: the top bar on a phone and the sidebar's head on a desktop.
export function BrandMark({ size }: { size: "sm" | "md" }) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-xl bg-brand text-white ${size === "md" ? "h-10 w-10" : "h-9 w-9"}`}
    >
      <GraduationCapIcon className="h-5 w-5" />
    </span>
  );
}
