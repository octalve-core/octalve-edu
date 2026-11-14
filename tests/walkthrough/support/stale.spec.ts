import { test, expect } from "@playwright/test";
import fs from "fs";
import os from "os";
import path from "path";
import { clearStaleEvidence } from "../../../scripts/walkthrough-run/stale.mjs";

// A run that fails before the tests write anything (a launch error, a missing browser) used to leave the PREVIOUS run's findings and timeline in place, and they read as
// this run's result. The runner removes them first; the video, the PDF and every other screenshot are left alone, because a finished strict run is the only copy of its
// deliverables.

const touch = (file: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "x");
};

test("the previous run's findings, observations, timeline and failure screenshots are removed, and nothing else is", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "stale-"));
  const pass = path.join(root, "desktop-light");
  const stale = [
    path.join(pass, "evidence", "findings.md"),
    path.join(pass, "evidence", "findings.json"),
    path.join(pass, "evidence", "observations.json"),
    path.join(pass, "timeline.json"),
    path.join(pass, "screenshots", "failure_01.png"),
    path.join(pass, "screenshots", "failure_12.png"),
  ];
  const kept = [
    path.join(pass, "screenshots", "step_001.png"),
    path.join(pass, "screenshots", "failure_notes.txt"),
    path.join(pass, "walkthrough.webm"),
    path.join(pass, "report.pdf"),
    path.join(root, "phone", "evidence", "findings.md"),
  ];
  for (const file of [...stale, ...kept]) touch(file);

  const removed = clearStaleEvidence(root, "desktop-light");

  expect(removed).toBe(stale.length);
  for (const file of stale) expect(fs.existsSync(file), file).toBe(false);
  for (const file of kept) expect(fs.existsSync(file), file).toBe(true);
  fs.rmSync(root, { recursive: true, force: true });
});

test("a pass that has never run has nothing to remove and is not an error", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "stale-"));
  expect(clearStaleEvidence(root, "desktop-light")).toBe(0);
  fs.rmSync(root, { recursive: true, force: true });
});
