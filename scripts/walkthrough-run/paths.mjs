// Where the walkthrough writes its evidence and deliverables.
//
// They always go to the MAIN checkout's git-ignored out/walkthrough/, never into a worktree: a worktree can be removed, and a finished run is the only copy of its video.
// `git rev-parse --git-common-dir` is the main checkout's .git folder from the main checkout and from any worktree alike.

import { execFileSync } from "child_process";
import path from "path";

const git = (...args) => execFileSync("git", args, { encoding: "utf-8" }).trim();

export const repoRoot = () => git("rev-parse", "--show-toplevel");

export const mainCheckout = () => path.dirname(git("rev-parse", "--path-format=absolute", "--git-common-dir"));

/// WALKTHROUGH_OUTPUT_ROOT wins when set (the runner sets it so that the tests and the report agree), else out/walkthrough/ in the main checkout.
export const outputRoot = () => process.env.WALKTHROUGH_OUTPUT_ROOT ?? path.join(mainCheckout(), "out", "walkthrough");
