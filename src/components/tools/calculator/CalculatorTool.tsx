"use client";

import { useState, useEffect, useCallback } from "react";
import { CopyIcon, CheckIcon, RefreshCwIcon } from "@/components/ui/icons";
import { evaluateArithmetic, formatCalculation } from "@/lib/tools/calculator";

interface CalculationHistoryItem {
  id: string;
  expression: string;
  result: string;
}

function safeEvaluate(expr: string): number | null {
  return evaluateArithmetic(expr);
}

function formatResult(val: number): string {
  return formatCalculation(val);
}

export function CalculatorTool() {
  const [expression, setExpression] = useState<string>("");
  const [result, setResult] = useState<string>("0");
  const [history, setHistory] = useState<CalculationHistoryItem[]>([]);
  const [copied, setCopied] = useState<boolean>(false);

  const handleInput = useCallback((val: string) => {
    setExpression((prev) => {
      // Prevent consecutive operators
      const lastChar = prev.slice(-1);
      const isOperator = ["+", "−", "×", "÷"].includes(val);
      const lastIsOperator = ["+", "−", "×", "÷"].includes(lastChar);
      if (isOperator && lastIsOperator) {
        return prev.slice(0, -1) + val;
      }
      return prev + val;
    });
  }, []);

  const handleClear = useCallback(() => {
    setExpression("");
    setResult("0");
  }, []);

  const handleBackspace = useCallback(() => {
    setExpression((prev) => prev.slice(0, -1));
  }, []);

  const handleCalculate = useCallback(() => {
    if (!expression.trim()) return;
    const computed = safeEvaluate(expression);
    if (computed !== null) {
      const formatted = formatResult(computed);
      setResult(formatted);
      setHistory((prev) => [
        {
          id: Math.random().toString(36).substring(2, 9),
          expression,
          result: formatted,
        },
        ...prev.slice(0, 4),
      ]);
    } else {
      setResult("Error");
    }
  }, [expression]);

  const handleQuickPreset = useCallback(
    (multiplier: number, label: string) => {
      const currentVal = safeEvaluate(expression) ?? safeEvaluate(result) ?? 0;
      const computed = currentVal * multiplier;
      const formatted = formatResult(computed);
      const newExpr = `${formatResult(currentVal)} ${label}`;
      setExpression(newExpr);
      setResult(formatted);
      setHistory((prev) => [
        {
          id: Math.random().toString(36).substring(2, 9),
          expression: newExpr,
          result: formatted,
        },
        ...prev.slice(0, 4),
      ]);
    },
    [expression, result],
  );

  const handleCopy = useCallback(async () => {
    try {
      const cleanNumber = result.replace(/,/g, "");
      await navigator.clipboard.writeText(cleanNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback ignore
    }
  }, [result]);

  // Keyboard navigation support
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an active text input or textarea
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }

      if (e.key >= "0" && e.key <= "9") {
        handleInput(e.key);
      } else if (e.key === ".") {
        handleInput(".");
      } else if (e.key === "+") {
        handleInput("+");
      } else if (e.key === "-") {
        handleInput("−");
      } else if (e.key === "*") {
        handleInput("×");
      } else if (e.key === "/") {
        e.preventDefault();
        handleInput("÷");
      } else if (e.key === "%") {
        handleInput("%");
      } else if (e.key === "(" || e.key === ")") {
        handleInput(e.key);
      } else if (e.key === "Enter" || e.key === "=") {
        e.preventDefault();
        handleCalculate();
      } else if (e.key === "Backspace") {
        handleBackspace();
      } else if (e.key === "Escape" || e.key === "c" || e.key === "C") {
        handleClear();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleInput, handleCalculate, handleBackspace, handleClear]);

  return (
    <div className="flex flex-col gap-4">
      {/* Display Screen */}
      <div className="relative rounded-2xl border border-line bg-canvas p-4 text-right shadow-inner">
        <div className="h-6 overflow-x-auto text-xs font-mono text-fg-muted whitespace-nowrap">{expression || "0"}</div>
        <div className="mt-1 flex items-baseline justify-between gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 rounded-lg border border-line bg-surface px-2 py-1 text-[11px] font-medium text-fg-muted transition-colors hover:border-brand-strong hover:text-fg"
            title="Copy result to clipboard"
            aria-label="Copy result"
          >
            {copied ? (
              <>
                <CheckIcon className="h-3.5 w-3.5 text-emerald-600" />
                <span className="text-emerald-600">Copied</span>
              </>
            ) : (
              <>
                <CopyIcon className="h-3.5 w-3.5" />
                <span>Copy</span>
              </>
            )}
          </button>
          <div
            data-testid="calculator-result"
            className="overflow-x-auto text-2xl font-bold font-mono tracking-tight text-fg whitespace-nowrap"
          >
            {result}
          </div>
        </div>
      </div>

      {/* School Financial Helpers */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line pb-3 text-xs">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted mr-1">Fee Helpers:</span>
        <button
          type="button"
          onClick={() => handleQuickPreset(0.95, "− 5% waiver")}
          className="rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-medium text-fg hover:border-brand-strong hover:bg-brand-tint hover:text-brand-fg transition-colors"
          title="Apply 5% Sibling / Early Waiver"
        >
          −5% Sibling
        </button>
        <button
          type="button"
          onClick={() => handleQuickPreset(0.9, "− 10% waiver")}
          className="rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-medium text-fg hover:border-brand-strong hover:bg-brand-tint hover:text-brand-fg transition-colors"
          title="Apply 10% Staff Child Waiver"
        >
          −10% Staff
        </button>
        <button
          type="button"
          onClick={() => handleQuickPreset(1.075, "+ 7.5% VAT")}
          className="rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-medium text-fg hover:border-brand-strong hover:bg-brand-tint hover:text-brand-fg transition-colors"
          title="Add 7.5% Tax / Surcharge"
        >
          +7.5% VAT
        </button>
      </div>

      {/* Keypad Grid */}
      <div className="grid grid-cols-4 gap-2">
        <button
          type="button"
          onClick={handleClear}
          className="rounded-xl border border-red-200 bg-red-50 py-3 text-sm font-semibold text-red-600 hover:bg-red-100 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-950/50 transition-colors"
        >
          C
        </button>
        <button
          type="button"
          onClick={() => handleInput("(")}
          className="rounded-xl border border-line bg-surface-2/60 py-3 text-sm font-medium text-fg hover:bg-surface-2 transition-colors"
        >
          (
        </button>
        <button
          type="button"
          onClick={() => handleInput(")")}
          className="rounded-xl border border-line bg-surface-2/60 py-3 text-sm font-medium text-fg hover:bg-surface-2 transition-colors"
        >
          )
        </button>
        <button
          type="button"
          onClick={() => handleInput("÷")}
          className="rounded-xl border border-brand-strong/30 bg-brand-tint py-3 text-base font-semibold text-brand-fg hover:bg-brand/20 transition-colors"
        >
          ÷
        </button>

        <button
          type="button"
          onClick={() => handleInput("7")}
          className="rounded-xl border border-line bg-surface py-3 text-base font-medium text-fg hover:bg-surface-2 transition-colors"
        >
          7
        </button>
        <button
          type="button"
          onClick={() => handleInput("8")}
          className="rounded-xl border border-line bg-surface py-3 text-base font-medium text-fg hover:bg-surface-2 transition-colors"
        >
          8
        </button>
        <button
          type="button"
          onClick={() => handleInput("9")}
          className="rounded-xl border border-line bg-surface py-3 text-base font-medium text-fg hover:bg-surface-2 transition-colors"
        >
          9
        </button>
        <button
          type="button"
          onClick={() => handleInput("×")}
          className="rounded-xl border border-brand-strong/30 bg-brand-tint py-3 text-base font-semibold text-brand-fg hover:bg-brand/20 transition-colors"
        >
          ×
        </button>

        <button
          type="button"
          onClick={() => handleInput("4")}
          className="rounded-xl border border-line bg-surface py-3 text-base font-medium text-fg hover:bg-surface-2 transition-colors"
        >
          4
        </button>
        <button
          type="button"
          onClick={() => handleInput("5")}
          className="rounded-xl border border-line bg-surface py-3 text-base font-medium text-fg hover:bg-surface-2 transition-colors"
        >
          5
        </button>
        <button
          type="button"
          onClick={() => handleInput("6")}
          className="rounded-xl border border-line bg-surface py-3 text-base font-medium text-fg hover:bg-surface-2 transition-colors"
        >
          6
        </button>
        <button
          type="button"
          onClick={() => handleInput("−")}
          className="rounded-xl border border-brand-strong/30 bg-brand-tint py-3 text-base font-semibold text-brand-fg hover:bg-brand/20 transition-colors"
        >
          −
        </button>

        <button
          type="button"
          onClick={() => handleInput("1")}
          className="rounded-xl border border-line bg-surface py-3 text-base font-medium text-fg hover:bg-surface-2 transition-colors"
        >
          1
        </button>
        <button
          type="button"
          onClick={() => handleInput("2")}
          className="rounded-xl border border-line bg-surface py-3 text-base font-medium text-fg hover:bg-surface-2 transition-colors"
        >
          2
        </button>
        <button
          type="button"
          onClick={() => handleInput("3")}
          className="rounded-xl border border-line bg-surface py-3 text-base font-medium text-fg hover:bg-surface-2 transition-colors"
        >
          3
        </button>
        <button
          type="button"
          onClick={() => handleInput("+")}
          className="rounded-xl border border-brand-strong/30 bg-brand-tint py-3 text-base font-semibold text-brand-fg hover:bg-brand/20 transition-colors"
        >
          +
        </button>

        <button
          type="button"
          onClick={() => handleInput("0")}
          className="rounded-xl border border-line bg-surface py-3 text-base font-medium text-fg hover:bg-surface-2 transition-colors"
        >
          0
        </button>
        <button
          type="button"
          onClick={() => handleInput(".")}
          className="rounded-xl border border-line bg-surface py-3 text-base font-medium text-fg hover:bg-surface-2 transition-colors"
        >
          .
        </button>
        <button
          type="button"
          onClick={() => handleInput("%")}
          className="rounded-xl border border-line bg-surface py-3 text-base font-medium text-fg hover:bg-surface-2 transition-colors"
        >
          %
        </button>
        <button
          type="button"
          onClick={handleCalculate}
          className="rounded-xl bg-brand py-3 text-base font-bold text-white shadow-sm hover:bg-brand/90 transition-colors"
        >
          =
        </button>
      </div>

      {/* Recent History Tape */}
      {history.length > 0 && (
        <div className="mt-1 border-t border-line pt-3">
          <div className="flex items-center justify-between text-[11px] font-semibold text-fg-muted mb-1.5">
            <span className="uppercase tracking-wider">Recent Calculations</span>
            <button type="button" onClick={() => setHistory([])} className="flex items-center gap-1 hover:text-fg transition-colors">
              <RefreshCwIcon className="h-3 w-3" />
              <span>Clear</span>
            </button>
          </div>
          <div className="space-y-1">
            {history.map((h) => (
              <div
                key={h.id}
                onClick={() => {
                  setExpression(h.result);
                  setResult(h.result);
                }}
                className="flex items-center justify-between rounded-lg px-2 py-1 text-xs font-mono transition-colors hover:bg-surface-2/60 cursor-pointer"
                title="Click to load result"
              >
                <span className="text-fg-muted truncate max-w-50">{h.expression}</span>
                <span className="font-semibold text-fg">{h.result}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
