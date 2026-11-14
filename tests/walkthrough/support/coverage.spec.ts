import { test, expect } from "@playwright/test";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// The coverage gate is code, so it is tamper-tested like the guard: break the matrix on purpose and watch it say so. Nothing here touches the real out/ folder or the real rows.

const ROOT = path.resolve(__dirname, "../../..");
const REAL_ROWS = path.join(ROOT, "tests/walkthrough/coverage/rows.json");
type Row = { id: string; route: string; roles: string[]; source?: string[]; status: string; reason?: string; [key: string]: unknown };
const realRows = (): Row[] => JSON.parse(fs.readFileSync(REAL_ROWS, "utf-8"));

function gate(rows: Row[], flag: "--structure" | "--check" | "", timeline?: object[]) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coverage-spec-"));
  const rowsFile = path.join(dir, "rows.json");
  fs.writeFileSync(rowsFile, JSON.stringify(rows));
  if (timeline) fs.writeFileSync(path.join(dir, "timeline.json"), JSON.stringify(timeline));
  const run = spawnSync(process.execPath, ["scripts/walkthrough-run/coverage.mjs", ...(flag ? [flag] : [])], {
    cwd: ROOT,
    encoding: "utf-8",
    env: { ...process.env, WALKTHROUGH_ROWS_FILE: rowsFile, WALKTHROUGH_OUTPUT_ROOT: dir },
  });
  const read = (name: string) => (fs.existsSync(path.join(dir, name)) ? fs.readFileSync(path.join(dir, name), "utf-8") : "");
  return {
    status: run.status,
    output: `${run.stdout}${run.stderr}`,
    matrix: read("coverage-matrix.md"),
    computed: read("coverage-computed.json"),
  };
}

/// Octalve's rows are written chapter by chapter (task 0053): until every page and navigation entry has one, the real matrix is not complete in structure and the two tests that need it say so (fixme)
/// instead of failing. The day the last page gets its row they start running by themselves.
const structureComplete = (): boolean => gate(realRows(), "--structure").status === 0;
const WRITTEN_CHAPTER_BY_CHAPTER = "task 0053: the matrix has a row for every page only after the last module's chapter is written";

test.describe("The coverage matrix gate", () => {
  test("the real matrix is complete in structure, and refuses to pass the final gate while any row is only planned", () => {
    test.fixme(!structureComplete(), WRITTEN_CHAPTER_BY_CHAPTER);
    const structure = gate(realRows(), "--structure");
    expect(structure.status, structure.output).toBe(0);
    const final = gate(realRows(), "--check");
    expect(final.status).toBe(1);
    expect(final.output).toMatch(/rows are still planned/);
  });

  test("a page with no row fails the gate", () => {
    const result = gate(
      realRows().filter((row) => row.route !== "/login"),
      "--structure",
    );
    expect(result.status).toBe(1);
    expect(result.output).toMatch(/page \/login has no row/);
  });

  test("a row that names a file that does not exist, a role that does not exist, a duplicate id, or an unexplained 'not demonstrable' fails", () => {
    const rows = realRows();
    const bad = (change: (row: Row) => void) => {
      const copy = JSON.parse(JSON.stringify(rows)) as Row[];
      change(copy[1]!);
      return gate(copy, "--structure");
    };
    const file = bad((row) => (row.source = ["src/components/nope/Missing.tsx"]));
    expect(file.status).toBe(1);
    expect(file.output).toMatch(/names src\/components\/nope\/Missing\.tsx, which does not exist/);
    const role = bad((row) => (row.roles = ["Head girl"]));
    expect(role.status).toBe(1);
    expect(role.output).toMatch(/names the role "Head girl"/);
    const dup = bad((row) => (row.id = rows[0]!.id));
    expect(dup.status).toBe(1);
    expect(dup.output).toMatch(/duplicate row id/);
    const reasonless = bad((row) => {
      row.status = "not-demonstrable";
      delete row.reason;
    });
    expect(reasonless.status).toBe(1);
    expect(reasonless.output).toMatch(/gives no reason/);
    const route = bad((row) => (row.route = "/no-such-page"));
    expect(route.status).toBe(1);
    expect(route.output).toMatch(/which is not a page/);
  });

  test("a row is ticked only by a recorded step, and the final gate passes exactly when every row is", () => {
    test.fixme(!structureComplete(), WRITTEN_CHAPTER_BY_CHAPTER);
    const rows = realRows();
    const runnable = rows.filter((row) => row.status !== "not-demonstrable").map((row) => row.id);
    const one = gate(rows, "", [{ id: 1, covers: ["SET-01"] }]);
    expect(one.matrix).toMatch(/\| SET-01 \|.*\| ticked \|/);
    expect(one.matrix).toMatch(/\| SET-03 \|.*\| planned \|/);
    const allButOne = gate(rows, "--check", [{ id: 1, covers: runnable.slice(1) }]);
    expect(allButOne.status).toBe(1);
    expect(allButOne.output).toMatch(/1 rows are still planned/);
    const all = gate(rows, "--check", [{ id: 1, covers: runnable }]);
    expect(all.status, all.output).toBe(0);
  });

  test("the API column and the 'no screen' list are computed from the code", () => {
    const result = gate(realRows(), "");
    expect(result.matrix).toMatch(/\| LOG-01 \|[^\n]*\/auth\/login/);
    expect(result.matrix).toMatch(/\| LOG-04 \|[^\n]*\/auth\/logout/);
    const computed = JSON.parse(result.computed) as {
      noScreen: Array<{ url: string }>;
      apiRoutes: Array<{ url: string; methods: string[] }>;
      pages: Array<{ route: string }>;
    };
    const noScreen = computed.noScreen.map((route) => route.url);
    expect(noScreen).toContain("/api/v1/webhooks/paystack");
    expect(noScreen).not.toContain("/api/v1/auth/login");
    expect(computed.pages.length).toBeGreaterThanOrEqual(36);
    expect(computed.apiRoutes.length).toBeGreaterThanOrEqual(290);
    expect(computed.apiRoutes.every((route) => route.methods.length > 0)).toBe(true);
  });
});
