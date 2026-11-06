"use client";

import { createContext, useContext, type ReactNode } from "react";

// Where this school's API lives, for every component below the Forms page's tabs, so the school's code is not threaded through each of them (the same idea as the question bank's
// `BankApiProvider`). The person's campus is never sent: the server uses the caller's own.
type FormsScope = { api: string; schoolCode: string };
const FormsApiContext = createContext<FormsScope | null>(null);

export function FormsApiProvider({ schoolCode, children }: { schoolCode: string; children: ReactNode }) {
  return (
    <FormsApiContext.Provider value={{ api: `/api/v1/schools/${encodeURIComponent(schoolCode)}`, schoolCode }}>
      {children}
    </FormsApiContext.Provider>
  );
}

/// The school's API base, e.g. `/api/v1/schools/abc`, and its code (for links to this school's pages).
export function useFormsApi(): FormsScope {
  const scope = useContext(FormsApiContext);
  if (scope === null) throw new Error("useFormsApi needs a FormsApiProvider above it.");
  return scope;
}

/// The form routes by kind: a practice set lives at `/forms`, a questionnaire at `/forms/questionnaires` and paper work at `/forms/paper-work`.
export const KIND_PATH = { PRACTICE_SET: "forms", QUESTIONNAIRE: "forms/questionnaires", PAPER_WORK: "forms/paper-work" } as const;
