"use client";

import { createContext, useContext, type ReactNode } from "react";

// Where this school's question bank API lives, for every component below the page's tabs, so the school's code is not threaded through each of them.
const BankApiContext = createContext<string | null>(null);

export function BankApiProvider({ schoolCode, children }: { schoolCode: string; children: ReactNode }) {
  return (
    <BankApiContext.Provider value={`/api/v1/schools/${encodeURIComponent(schoolCode)}/question-bank`}>{children}</BankApiContext.Provider>
  );
}

/// The base of the question bank API, e.g. `/api/v1/schools/abc/question-bank`.
export function useBankApi(): string {
  const base = useContext(BankApiContext);
  if (base === null) throw new Error("useBankApi needs a BankApiProvider above it.");
  return base;
}
