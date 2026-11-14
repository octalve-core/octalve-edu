export const RESUME_CHAPTER: string;
export const REQUEST_FILE: string;
export const DONE_FILE: string;
export function chapterSlug(name: string): string;
export function onlyChapters(env: Record<string, string | undefined>): string[];
export function chapterWanted(name: string, only: string[]): boolean;
export function parseResume(env: Record<string, string | undefined>, mode: string): { after: string | null; only: string[] };
export function checkpointDir(passDir: string): string;
export function checkpointFile(passDir: string, chapterName: string): string;
export function clearCheckpoints(passDir: string): void;
export function mfaKeyFor(passDir: string, options: { create: boolean }): string;
export function dumpArgs(options: { host: string; port: string | number; user: string; db: string; file: string }): string[];
export function restoreArgs(options: { host: string; port: string | number; user: string; db: string; file: string }): string[];
export function requestCheckpoint(passDir: string, chapter: string, options?: { timeoutMs?: number; pollMs?: number }): Promise<void>;
export function startCheckpointServer(
  passDir: string,
  save: (chapter: string) => Promise<void>,
  options?: { pollMs?: number },
): { stop: () => void };
