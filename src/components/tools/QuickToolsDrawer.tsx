"use client";

import { useState, useEffect } from "react";
import { Role } from "@prisma/client";
import { CalculatorTool } from "./calculator/CalculatorTool";
import { PaymentRecorderTool } from "./payments/PaymentRecorderTool";
import { QuickNotesTool } from "./QuickNotesTool";
import { CalculatorIcon, ReceiptIcon, FileTextIcon, XIcon } from "@/components/ui/icons";
import type { QuickToolId } from "./types";

interface QuickToolsDrawerProps {
  open: boolean;
  onClose: () => void;
  userRole?: Role;
  schoolCode?: string;
  initialTool?: QuickToolId;
}

export function QuickToolsDrawer({
  open,
  onClose,
  userRole,
  schoolCode,
  initialTool = "calculator",
}: QuickToolsDrawerProps) {
  const canRecordPayments =
    userRole === Role.ADMIN || userRole === Role.CAMPUS_ADMIN;

  const resolvedInitialTool =
    initialTool === "payment-recorder" && !canRecordPayments ? "calculator" : initialTool;

  const [selectedTool, setSelectedTool] = useState<QuickToolId | null>(null);
  const activeTool = selectedTool ?? resolvedInitialTool;

  const tools = [
    {
      id: "calculator" as const,
      name: "Calculator",
      icon: CalculatorIcon,
      available: true,
    },
    {
      id: "payment-recorder" as const,
      name: "Record Payment",
      icon: ReceiptIcon,
      available: canRecordPayments,
    },
    {
      id: "scratchpad" as const,
      name: "Scratchpad",
      icon: FileTextIcon,
      available: true,
    },
  ].filter((t) => t.available);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Quick Tools"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-xs transition-opacity sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border-t border-line bg-surface shadow-2xl transition-all sm:max-h-[85vh] sm:max-w-md sm:rounded-3xl sm:border"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile drag handle bar */}
        <div className="flex items-center justify-center pt-2.5 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-line" />
        </div>

        {/* Drawer Header & Tabs */}
        <div className="border-b border-line px-5 pt-3 pb-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-fg">Quick Tools</h2>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full text-fg-muted hover:bg-surface-2 hover:text-fg transition-colors"
              aria-label="Close Quick Tools"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>

          {/* Tool Tab Bar */}
          <div className="mt-3 flex gap-1 rounded-xl bg-surface-2 p-1">
            {tools.map((t) => {
              const Icon = t.icon;
              const selected = activeTool === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedTool(t.id)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition-all ${
                    selected
                      ? "bg-surface text-fg shadow-xs ring-1 ring-line"
                      : "text-fg-muted hover:text-fg"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{t.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Active Tool Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTool === "calculator" && <CalculatorTool />}
          {activeTool === "payment-recorder" && (
            <PaymentRecorderTool schoolCode={schoolCode} />
          )}
          {activeTool === "scratchpad" && <QuickNotesTool />}
        </div>
      </div>
    </div>
  );
}
