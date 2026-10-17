"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useShell } from "@/components/shell/ShellProvider";
import { WrenchIcon } from "@/components/ui/icons";
import { QuickToolsDrawer } from "./QuickToolsDrawer";
import type { QuickToolId } from "./types";

import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";

export function QuickToolsTrigger() {
  const { school } = useShell();
  const userRole = school?.role;
  const schoolCode = school?.code;

  const searchParams = useSearchParams();
  const requestedTool = searchParams.get("tool");
  const isPwaTool =
    requestedTool === "calculator" ||
    requestedTool === "payment-recorder" ||
    requestedTool === "payment-link" ||
    requestedTool === "broadcast" ||
    requestedTool === "scratchpad";

  const [open, setOpen] = useState(isPwaTool);
  const [initialTool] = useState<QuickToolId>(
    isPwaTool ? (requestedTool as QuickToolId) : "calculator",
  );

  // Global Keyboard Shortcut: Cmd+K / Ctrl+K or Alt+T
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K / Ctrl+K or Alt+T
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      } else if (e.altKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      {/* Floating Action Button:
          Mobile: bottom-20 right-4 (clears MobileNav at bottom-0)
          Desktop: bottom-6 right-6
      */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open Quick Tools (Cmd+K)"
        title="Quick Tools (Cmd+K or Alt+T)"
        className="fixed bottom-20 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand text-white shadow-lg shadow-brand/25 transition-all duration-200 hover:scale-105 hover:bg-brand/90 hover:shadow-xl active:scale-95 sm:bottom-6 sm:right-6 sm:h-12 sm:w-12 focus:outline-none focus:ring-2 focus:ring-brand-strong focus:ring-offset-2"
      >
        <WrenchIcon className="h-5 w-5" />
      </button>

      <QuickToolsDrawer
        open={open}
        onClose={() => setOpen(false)}
        userRole={userRole}
        schoolCode={schoolCode}
        initialTool={initialTool}
      />

      <ServiceWorkerRegister schoolCode={schoolCode} />
    </>
  );
}
