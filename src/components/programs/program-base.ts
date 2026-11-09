import { createContext, useContext } from "react";

// The API base of the program on screen (`/api/v1/schools/<code>/programs/<id>`), given once by the program page so the tabs below it need not pass it down.

export const ProgramBaseContext = createContext("");
export const useProgramBase = (): string => useContext(ProgramBaseContext);

/// The school code in the base (`/api/v1/schools/<code>/programs/<id>`).
export const schoolCodeOfBase = (base: string): string => base.split("/")[4] ?? "";
