import * as path from "path";
import { test } from "@playwright/test";
import { Walk } from "./support/walk";
import { resume } from "./chapters/resume";
import { c01Start } from "./chapters/c01-start";
import { c02School } from "./chapters/c02-school";
import { c03Users } from "./chapters/c03-users";
import { c04Academics } from "./chapters/c04-academics";
import { c05People } from "./chapters/c05-people";
import { c06PupilAndGuardian } from "./chapters/c06-pupil-and-guardian";
import { c07Teaching } from "./chapters/c07-teaching";
import { c08Results } from "./chapters/c08-results";
import { c09Finance } from "./chapters/c09-finance";
import { c10Communication } from "./chapters/c10-communication";
import { c11QuestionBank } from "./chapters/c11-question-bank";
import { c12Forms } from "./chapters/c12-forms";
import { c13PaperWork } from "./chapters/c13-paper-work";
import { c14PracticeAndMarking } from "./chapters/c14-practice-and-marking";
import { c15Programs } from "./chapters/c15-programs";
import { c16ProgramPeople } from "./chapters/c16-program-people";

// The journey of one pass (task 0033). One browser context, one recording, chapters in the order the data is made (section 6.6). The pass is the project that runs it (desktop-light,
// desktop-dark, phone); the chapters are the same in each. WALKTHROUGH_MODE=recon records a chapter that stops early as a finding and goes on; the default, strict, stops at the first failure.

const outputRoot = process.env.WALKTHROUGH_OUTPUT_ROOT ?? path.resolve("out", "walkthrough");

test("the walkthrough", async ({ page }, testInfo) => {
  const pass = testInfo.project.name;
  const passDir = path.join(outputRoot, pass);
  const walk = new Walk(page, path.join(passDir, "screenshots"));
  await walk.init();
  await walk.goto("/");

  // the app starts dark and does not follow the system setting: the light and phone passes click the toggle, the dark pass shows it working and comes back
  const theme = pass === "desktop-dark" ? "dark" : "light";

  // Each chapter's timeline and findings are written as soon as it ends (and written again, over the same files, when the next ends): a run that is stopped, or that outgrows its time
  // limit, keeps what it had. The last call below is the same write.
  const chapter = async (name: string, run: () => Promise<void>) => {
    await walk.chapter(name, run);
    walk.saveTimeline(path.join(passDir, "timeline.json"));
    walk.saveFindings(path.join(passDir, "evidence"));
  };

  // a resumed recon (WALKTHROUGH_ONLY): sign in again, and run only the chapters named; a whole run skips this
  await chapter("Resume", () => resume(walk, page, theme));
  await chapter("C01 Start and sign in", () => c01Start(walk, page, theme));
  await chapter("C02 The school", () => c02School(walk, page));
  await chapter("C03 Users and sign-ins", () => c03Users(walk, page));
  await chapter("C04 Academic setup", () => c04Academics(walk, page));
  await chapter("C05 People", () => c05People(walk, page));
  await chapter("C06 The pupil and the guardian", () => c06PupilAndGuardian(walk, page));
  await chapter("C07 Teaching and attendance", () => c07Teaching(walk, page));
  await chapter("C08 Results", () => c08Results(walk, page));
  await chapter("C09 Finance", () => c09Finance(walk, page));
  await chapter("C10 Communication", () => c10Communication(walk, page));
  await chapter("C11 Question bank", () => c11QuestionBank(walk, page));
  await chapter("C12 Forms", () => c12Forms(walk, page));
  await chapter("C13 Paper work", () => c13PaperWork(walk, page));
  await chapter("C14 Practice and marking", () => c14PracticeAndMarking(walk, page));
  await chapter("C15 Programs", () => c15Programs(walk, page));
  await chapter("C16 Program people", () => c16ProgramPeople(walk, page));

  walk.saveTimeline(path.join(passDir, "timeline.json"));
  walk.saveFindings(path.join(passDir, "evidence"));
  walk.finish(path.join(passDir, "evidence", "observations.json"), { strict: walk.mode === "strict" });
});
