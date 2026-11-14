import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Walk } from "./walk";
import {
  RESUME_CHAPTER,
  chapterSlug,
  chapterWanted,
  checkpointDir,
  checkpointFile,
  clearCheckpoints,
  dumpArgs,
  mfaKeyFor,
  onlyChapters,
  parseResume,
  requestCheckpoint,
  restoreArgs,
  startCheckpointServer,
} from "../../../scripts/walkthrough-run/checkpoint.mjs";

// Recon checkpoints (task 0033, section 6.16): saving the walkthrough database at the end of a chapter, and resuming a recon from one. These tests are the rules of that design; the real
// pg_dump and pg_restore are proved by a real resumed recon (recorded in section 6.16), not here.

const passDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "checkpoint-spec-"));
const DB = { host: "localhost", port: "5434", user: "aleemaan", db: "wip_aleemaan_walkthrough", file: "/tmp/x.dump" };

/// Runs `body` with some environment variables set, and puts them back.
async function withEnv(values: Record<string, string | undefined>, body: () => Promise<void> | void): Promise<void> {
  const before = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    await body();
  } finally {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test.describe("Recon checkpoints: the settings", () => {
  test("a chapter's name becomes a file name, and nothing else does", () => {
    expect(chapterSlug("C16 Users")).toBe("c16_users");
    expect(chapterSlug("C03 People")).toBe("c03_people");
    expect(chapterSlug("C05 Assessment and grading")).toBe("c05_assessment_and_grading");
    expect(chapterSlug("../../etc/passwd")).toBe("etc_passwd");
    expect(chapterSlug("  --  ")).toBe("");
  });

  test("WALKTHROUGH_ONLY is a comma separated list, and a chapter runs when nothing is named or when it is", () => {
    expect(onlyChapters({})).toEqual([]);
    expect(onlyChapters({ WALKTHROUGH_ONLY: " C16 Users , C17 Forms ,," })).toEqual(["C16 Users", "C17 Forms"]);
    expect(chapterWanted("C01 Start and sign in", [])).toBe(true);
    expect(chapterWanted("C16 Users", ["C16 Users"])).toBe(true);
    expect(chapterWanted("C15 Approvals", ["C16 Users"])).toBe(false);
    // the sign-in that starts a resumed run is wanted only when chapters are named
    expect(chapterWanted(RESUME_CHAPTER, [])).toBe(false);
    expect(chapterWanted(RESUME_CHAPTER, ["C16 Users"])).toBe(true);
  });

  test("a resumed run needs both settings, in a recon, and never names the sign-in itself", () => {
    expect(parseResume({}, "strict")).toEqual({ after: null, only: [] });
    expect(parseResume({}, "recon")).toEqual({ after: null, only: [] });
    expect(parseResume({ WALKTHROUGH_RESUME_AFTER: "C15 Approvals", WALKTHROUGH_ONLY: "C16 Users, C17 Forms" }, "recon")).toEqual({
      after: "C15 Approvals",
      only: ["C16 Users", "C17 Forms"],
    });
    // a strict run, and so the video, is the whole journey
    expect(() => parseResume({ WALKTHROUGH_RESUME_AFTER: "C15 Approvals", WALKTHROUGH_ONLY: "C16 Users" }, "strict")).toThrow(/recon/);
    expect(() => parseResume({ WALKTHROUGH_ONLY: "C16 Users" }, "strict")).toThrow(/recon/);
    // half a request is a mistake, not a guess
    expect(() => parseResume({ WALKTHROUGH_RESUME_AFTER: "C15 Approvals" }, "recon")).toThrow(/go together/);
    expect(() => parseResume({ WALKTHROUGH_ONLY: "C16 Users" }, "recon")).toThrow(/go together/);
    expect(() => parseResume({ WALKTHROUGH_RESUME_AFTER: "C15 Approvals", WALKTHROUGH_ONLY: RESUME_CHAPTER }, "recon")).toThrow(/Resume/);
  });

  test("pg_dump and pg_restore are given only a database a walkthrough owns", () => {
    expect(dumpArgs(DB)).toEqual([
      "-h",
      "localhost",
      "-p",
      "5434",
      "-U",
      "aleemaan",
      "-Fc",
      "--no-owner",
      "--no-privileges",
      "-f",
      "/tmp/x.dump",
      "wip_aleemaan_walkthrough",
    ]);
    expect(restoreArgs(DB)).toContain("--exit-on-error");
    expect(restoreArgs(DB).slice(-3)).toEqual(["-d", "wip_aleemaan_walkthrough", "/tmp/x.dump"]);
    for (const db of ["aleemaan_dev", "aleemaan_test", "aleemaan", "postgres", "wip_aleemaan_dev_walkthrough", ""]) {
      expect(() => dumpArgs({ ...DB, db }), db).toThrow(/Refusing/);
      expect(() => restoreArgs({ ...DB, db }), db).toThrow(/Refusing/);
    }
  });
});

test.describe("Recon checkpoints: what is kept beside the saves", () => {
  test("clearing removes the saves and the key, and nothing beside them", () => {
    const dir = passDir();
    fs.mkdirSync(path.join(dir, "evidence"));
    fs.writeFileSync(path.join(dir, "evidence", "findings.md"), "kept");
    fs.mkdirSync(checkpointDir(dir));
    fs.writeFileSync(checkpointFile(dir, "C15 Approvals"), "dump");
    mfaKeyFor(dir, { create: true });
    clearCheckpoints(dir);
    expect(fs.existsSync(checkpointDir(dir))).toBe(false);
    expect(fs.readFileSync(path.join(dir, "evidence", "findings.md"), "utf8")).toBe("kept");
    // clearing what is not there is not an error
    expect(() => clearCheckpoints(dir)).not.toThrow();
  });

  test("the key of two-step secrets is made once for a whole recon, is private to its owner, and is the one a resumed recon reads", () => {
    const dir = passDir();
    expect(() => mfaKeyFor(dir, { create: false })).toThrow(/whole recon/);
    const key = mfaKeyFor(dir, { create: true });
    expect(Buffer.from(key, "base64")).toHaveLength(32);
    expect(mfaKeyFor(dir, { create: false })).toBe(key);
    const file = path.join(checkpointDir(dir), "mfa.key");
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    // a second whole recon makes a new one
    expect(mfaKeyFor(dir, { create: true })).not.toBe(key);
  });
});

test.describe("Recon checkpoints: the handshake between the walk and the runner", () => {
  test("the walk waits until the runner has saved, and the runner is told which chapter", async () => {
    const dir = passDir();
    const saved: string[] = [];
    const server = startCheckpointServer(
      dir,
      async (chapter: string) => {
        await new Promise((resolve) => setTimeout(resolve, 300)); // a dump takes time, and the walk must not go on meanwhile
        saved.push(chapter);
      },
      { pollMs: 20 },
    );
    try {
      await requestCheckpoint(dir, "C15 Approvals", { pollMs: 20 });
      expect(saved).toEqual(["C15 Approvals"]);
      await requestCheckpoint(dir, "C16 Users", { pollMs: 20 });
      expect(saved).toEqual(["C15 Approvals", "C16 Users"]);
      // nothing is left behind to be taken for the next request's answer
      expect(fs.readdirSync(dir)).toEqual([]);
    } finally {
      server.stop();
    }
  });

  test("a save that fails stops the walk, with the runner's reason", async () => {
    const dir = passDir();
    const server = startCheckpointServer(
      dir,
      async () => {
        throw new Error("pg_dump exited with code 1");
      },
      { pollMs: 20 },
    );
    try {
      await expect(requestCheckpoint(dir, "C15 Approvals", { pollMs: 20 })).rejects.toThrow(
        /could not be saved: pg_dump exited with code 1/,
      );
    } finally {
      server.stop();
    }
  });

  test("nobody answering is said, with the chapter and the time, and does not wait for ever", async () => {
    const dir = passDir();
    await expect(requestCheckpoint(dir, "C15 Approvals", { timeoutMs: 250, pollMs: 20 })).rejects.toThrow(/did not answer .*C15 Approvals/);
  });

  test("a request or an answer left by a run that was stopped is not taken for this run's", async () => {
    const dir = passDir();
    fs.writeFileSync(path.join(dir, "checkpoint-done.json"), JSON.stringify({ ok: true }));
    fs.writeFileSync(path.join(dir, "checkpoint-request.json"), JSON.stringify({ chapter: "C99 Old" }));
    const saved: string[] = [];
    const server = startCheckpointServer(dir, async (chapter: string) => void saved.push(chapter), { pollMs: 20 });
    try {
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(saved).toEqual([]);
      await requestCheckpoint(dir, "C15 Approvals", { pollMs: 20 });
      expect(saved).toEqual(["C15 Approvals"]);
    } finally {
      server.stop();
    }
  });
});

test.describe("Recon checkpoints: what the walk does with them", () => {
  /// A walk in recon mode, whose pass folder is a fresh temporary one.
  async function reconWalk(page: import("@playwright/test").Page) {
    const dir = passDir();
    let walk!: Walk;
    await withEnv({ WALKTHROUGH_MODE: "recon" }, () => {
      walk = new Walk(page, path.join(dir, "screenshots"));
    });
    await walk.init();
    await walk.goto("data:text/html,<title>t</title><main><h1>Here</h1></main>");
    return { walk, dir };
  }

  test("with nothing named every chapter runs and no checkpoint is asked for; the resume sign-in is skipped", async ({ page }) => {
    const { walk } = await reconWalk(page);
    const ran: string[] = [];
    await withEnv({ WALKTHROUGH_ONLY: undefined, WALKTHROUGH_CHECKPOINTS: undefined }, async () => {
      await walk.chapter(RESUME_CHAPTER, async () => void ran.push("resume"));
      await walk.chapter("C01 One", async () => void ran.push("one"));
      await walk.chapter("C02 Two", async () => void ran.push("two"));
    });
    expect(ran).toEqual(["one", "two"]);
  });

  test("with chapters named only those run, after the resume sign-in, in a recon; the others are skipped without a trace", async ({
    page,
  }) => {
    const { walk } = await reconWalk(page);
    const ran: string[] = [];
    await withEnv({ WALKTHROUGH_ONLY: "C16 Users", WALKTHROUGH_CHECKPOINTS: undefined }, async () => {
      await walk.chapter(RESUME_CHAPTER, async () => void ran.push("resume"));
      await walk.chapter("C15 Approvals", async () => void ran.push("approvals"));
      await walk.chapter("C16 Users", async () => void ran.push("users"));
      await walk.chapter("C17 Forms", async () => void ran.push("forms"));
    });
    expect(ran).toEqual(["resume", "users"]);
  });

  test("a chapter that ended is saved by name and the walk waited for it; a chapter that stopped is not; the resume sign-in never is", async ({
    page,
  }) => {
    const { walk, dir } = await reconWalk(page);
    const saved: string[] = [];
    const server = startCheckpointServer(dir, async (chapter: string) => void saved.push(chapter), { pollMs: 20 });
    try {
      await withEnv({ WALKTHROUGH_ONLY: "C16 Users,C17 Forms", WALKTHROUGH_CHECKPOINTS: "save" }, async () => {
        await walk.chapter(RESUME_CHAPTER, async () => undefined);
        await walk.chapter("C16 Users", async () => undefined);
        expect(saved).toEqual(["C16 Users"]); // already saved when the chapter call returned
        const stopped = await walk.chapter("C17 Forms", async () => {
          throw new Error("a step failed");
        });
        expect(stopped).toBe(false);
      });
      expect(saved).toEqual(["C16 Users"]);
    } finally {
      server.stop();
    }
  });

  test("a save that fails stops the run in the chapter's own words, not as a chapter that stopped", async ({ page }) => {
    const { walk, dir } = await reconWalk(page);
    const server = startCheckpointServer(
      dir,
      async () => {
        throw new Error("disk full");
      },
      { pollMs: 20 },
    );
    try {
      await withEnv({ WALKTHROUGH_ONLY: undefined, WALKTHROUGH_CHECKPOINTS: "save" }, async () => {
        await expect(walk.chapter("C01 One", async () => undefined)).rejects.toThrow(/could not be saved: disk full/);
      });
      expect(walk.getFindings()).toHaveLength(0);
    } finally {
      server.stop();
    }
  });

  test("a strict run refuses to run only some chapters, and a name that no chapter has is said at the end", async ({ page }) => {
    const strict = new Walk(page, path.join(passDir(), "screenshots"));
    expect(strict.mode).toBe("strict");
    await withEnv({ WALKTHROUGH_ONLY: "C16 Users" }, async () => {
      await expect(strict.chapter("C16 Users", async () => undefined)).rejects.toThrow(/recon/);
    });
    const { walk, dir } = await reconWalk(page);
    await withEnv({ WALKTHROUGH_ONLY: "C16 Users,C16 Usres", WALKTHROUGH_CHECKPOINTS: undefined }, async () => {
      await walk.chapter("C16 Users", async () => undefined);
      expect(() => walk.finish(path.join(dir, "observations.json"), { strict: false })).toThrow(/does not have: C16 Usres/);
    });
  });
});
