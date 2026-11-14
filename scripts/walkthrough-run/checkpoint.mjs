// Recon checkpoints (task 0033, section 6.16): a RECON of one new chapter without replaying the chapters before it.
//
// A recon saves the walkthrough database at the end of every chapter that ended without stopping, and a later recon can restore one of those saves and run only the chapters it is
// asked to. Never a strict run and never the final video: those are always the whole journey from an empty database, so the claim "C01 to Cnn pass" is made only from a whole run.
//
// Kept apart from run.mjs so that every rule is tested (tests/walkthrough/support/checkpoint.spec.ts). The walk (a support file of the journey) imports the pure parts too.

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { assertWalkthroughDbName } from "./safety.mjs";

/// The pseudo-chapter that signs in again at the start of a resumed run. It has no steps of its own, never saves a checkpoint, and runs only when WALKTHROUGH_ONLY is set.
export const RESUME_CHAPTER = "Resume";
export const REQUEST_FILE = "checkpoint-request.json";
export const DONE_FILE = "checkpoint-done.json";

/// "C16 Users" becomes "c16_users": a file name, nothing else.
export const chapterSlug = (name) =>
  String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

/// WALKTHROUGH_ONLY: the chapters to run after a restore, comma separated.
export const onlyChapters = (env) =>
  String(env.WALKTHROUGH_ONLY ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);

/// Whether the walk runs a chapter: everything when nothing is named, otherwise only what is named, and the Resume pseudo-chapter only then.
export const chapterWanted = (name, only) => (name === RESUME_CHAPTER ? only.length > 0 : only.length === 0 || only.includes(name));

/// The two settings of a resumed run. Both or neither; a recon only (a strict run is the whole journey).
export function parseResume(env, mode) {
  const after = String(env.WALKTHROUGH_RESUME_AFTER ?? "").trim();
  const only = onlyChapters(env);
  if (!after && only.length === 0) return { after: null, only: [] };
  if (mode !== "recon") {
    throw new Error(
      "WALKTHROUGH_RESUME_AFTER and WALKTHROUGH_ONLY are for a recon run: a strict run, and so the video, is the whole journey from an empty database.",
    );
  }
  if (!after || only.length === 0) {
    throw new Error(
      "WALKTHROUGH_RESUME_AFTER and WALKTHROUGH_ONLY go together: name the chapter whose checkpoint is restored and the chapters to run after it.",
    );
  }
  if (only.includes(RESUME_CHAPTER))
    throw new Error(`"${RESUME_CHAPTER}" is the sign-in that starts a resumed run; it is not named in WALKTHROUGH_ONLY.`);
  return { after, only };
}

export const checkpointDir = (passDir) => path.join(passDir, "checkpoints");
export const checkpointFile = (passDir, chapterName) => path.join(checkpointDir(passDir), `${chapterSlug(chapterName)}.dump`);
const keyFile = (passDir) => path.join(checkpointDir(passDir), "mfa.key");

/// Removes the saves of an earlier whole recon. Only a folder called "checkpoints", so a wrong argument cannot remove anything else.
export function clearCheckpoints(passDir) {
  const dir = checkpointDir(passDir);
  if (path.basename(dir) !== "checkpoints") throw new Error(`Refusing to clear "${dir}": it is not a checkpoints folder.`);
  fs.rmSync(dir, { recursive: true, force: true });
}

/// The key that encrypts two-step secrets is the one thing the database dump does not carry (it lives in the server's environment), so a recon with checkpoints keeps it beside them:
/// a throwaway key for a throwaway local database, mode 600, never printed. A whole recon makes a new one (after clearing the folder); a resumed recon reads the one its saves were made with.
export function mfaKeyFor(passDir, { create }) {
  const file = keyFile(passDir);
  if (create) {
    fs.mkdirSync(checkpointDir(passDir), { recursive: true });
    const key = crypto.randomBytes(32).toString("base64");
    fs.writeFileSync(file, key, { mode: 0o600 });
    return key;
  }
  if (!fs.existsSync(file))
    throw new Error(`No key beside the checkpoints in ${checkpointDir(passDir)}: run a whole recon first, it saves them.`);
  return fs.readFileSync(file, "utf8").trim();
}

/// The arguments of pg_dump and pg_restore, built only for a database a walkthrough owns.
export function dumpArgs({ host, port, user, db, file }) {
  assertWalkthroughDbName(db);
  return ["-h", host, "-p", String(port), "-U", user, "-Fc", "--no-owner", "--no-privileges", "-f", file, db];
}
export function restoreArgs({ host, port, user, db, file }) {
  assertWalkthroughDbName(db);
  return ["-h", host, "-p", String(port), "-U", user, "--no-owner", "--no-privileges", "--exit-on-error", "-d", db, file];
}

// ---- the handshake: the walk asks, the runner answers, and the journey waits between two chapters -------------------------------------------------------------------------------------

const writeAtomically = (file, text) => {
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, text);
  fs.renameSync(temporary, file);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/// The walk's side: ask for a checkpoint after `chapter` and wait until the runner has made it. Throws with the runner's reason when it could not.
export async function requestCheckpoint(passDir, chapter, { timeoutMs = 120_000, pollMs = 150 } = {}) {
  fs.mkdirSync(passDir, { recursive: true });
  fs.rmSync(path.join(passDir, DONE_FILE), { force: true });
  writeAtomically(path.join(passDir, REQUEST_FILE), JSON.stringify({ chapter }));
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const doneFile = path.join(passDir, DONE_FILE);
    if (fs.existsSync(doneFile)) {
      const answer = JSON.parse(fs.readFileSync(doneFile, "utf8"));
      fs.rmSync(doneFile, { force: true });
      if (!answer.ok) throw new Error(`The checkpoint after "${chapter}" could not be saved: ${answer.error}`);
      return;
    }
    await sleep(pollMs);
  }
  throw new Error(`The runner did not answer the checkpoint request after "${chapter}" within ${timeoutMs / 1000} seconds.`);
}

/// The runner's side: while the tests run, answer each request with `save(chapter)` (one at a time) and write the answer. Returns { stop }.
export function startCheckpointServer(passDir, save, { pollMs = 200 } = {}) {
  fs.mkdirSync(passDir, { recursive: true });
  // a request or an answer left by a run that was stopped must not be taken for this run's
  fs.rmSync(path.join(passDir, REQUEST_FILE), { force: true });
  fs.rmSync(path.join(passDir, DONE_FILE), { force: true });
  let busy = false;
  const timer = setInterval(async () => {
    const requestFile = path.join(passDir, REQUEST_FILE);
    if (busy || !fs.existsSync(requestFile)) return;
    busy = true;
    try {
      const { chapter } = JSON.parse(fs.readFileSync(requestFile, "utf8"));
      fs.rmSync(requestFile, { force: true });
      let answer = { ok: true };
      try {
        await save(chapter);
      } catch (error) {
        answer = { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
      writeAtomically(path.join(passDir, DONE_FILE), JSON.stringify(answer));
    } finally {
      busy = false;
    }
  }, pollMs);
  return { stop: () => clearInterval(timer) };
}
