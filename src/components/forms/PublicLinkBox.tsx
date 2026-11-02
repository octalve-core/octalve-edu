"use client";

import { Button } from "@/components/ui/Button";
import { useFormsApi } from "@/components/forms/FormsApi";
import { CopyIcon } from "@/components/ui/icons";

/// The link of a public questionnaire with a button to copy it, and the weakness of a public form in words. The link works once the questionnaire is published. It carries the school's code as well
/// as the token (`/q/<code>/<token>`): the public API is addressed by school, and a token of another school's questionnaire is "not found".
export function PublicLinkBox({
  shareToken,
  published,
  onCopied,
}: {
  shareToken: string | null | undefined;
  published: boolean;
  onCopied: () => void;
}) {
  const { schoolCode } = useFormsApi();
  const link =
    shareToken && published
      ? `${typeof window === "undefined" ? "" : window.location.origin}/q/${encodeURIComponent(schoolCode)}/${shareToken}`
      : null;
  return (
    <div className="space-y-2 rounded-xl border border-line bg-field p-3 text-sm">
      {link ? (
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 break-all text-fg">{link}</code>
          <Button
            variant="secondary"
            onClick={async () => {
              await navigator.clipboard?.writeText(link).catch(() => undefined);
              onCopied();
            }}
          >
            <CopyIcon className="h-4 w-4" />
            Copy link
          </Button>
        </div>
      ) : (
        <p className="text-fg-muted">The link works once the questionnaire is published.</p>
      )}
      <p className="text-xs text-fg-muted">
        A public link cannot tell who is answering. Each browser is asked to answer once, but anyone can clear that and answer again.
      </p>
    </div>
  );
}
