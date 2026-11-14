// Removes the PREVIOUS run's verdict from a pass's evidence folder before a new run starts.
//
// A run that fails before the tests write anything (a launch error, a missing browser) used to leave the last run's findings.md and timeline.json where they were, and they read as
// this run's result (the trap of 2026-11-12: "recon 22: findings fresh" had to be proved by comparing file times against a marker). Only the verdict is removed: findings, observations,
// the timeline and the failure screenshots. The video, the PDF and every other screenshot stay, because a finished strict run is the only copy of its deliverables.

import fs from "fs";
import path from "path";

const VERDICT_FILES = [
  path.join("evidence", "findings.md"),
  path.join("evidence", "findings.json"),
  path.join("evidence", "observations.json"),
  "timeline.json",
];
const FAILURE_SHOT = /^failure_\d+\.png$/;

/// Returns how many files were removed.
export function clearStaleEvidence(outputRoot, pass) {
  const dir = path.join(outputRoot, pass);
  let removed = 0;
  for (const name of VERDICT_FILES) {
    const file = path.join(dir, name);
    if (fs.existsSync(file)) {
      fs.rmSync(file, { force: true });
      removed += 1;
    }
  }
  const shots = path.join(dir, "screenshots");
  if (fs.existsSync(shots)) {
    for (const name of fs.readdirSync(shots)) {
      if (FAILURE_SHOT.test(name)) {
        fs.rmSync(path.join(shots, name), { force: true });
        removed += 1;
      }
    }
  }
  return removed;
}
