#!/usr/bin/env node

/**
 * The walkthrough's coverage matrix (Octalve Edu).
 *
 * The rows are written by hand in tests/walkthrough/coverage/rows.json (what a person can do, who can do it, the click that proves it, and the same for what each role must be
 * refused). Everything else is COMPUTED from the code, so that a gap is a list and not a feeling:
 *   - the pages (every src/app page.tsx) and the navigation (src/components/shell/nav.ts);
 *   - the API routes (every src/app/api route.ts, its methods, and who may call it from the function catalog in docs/functions);
 *   - which screens call which route (each page's imports are followed, and the "/api/v1/..." strings in them are matched to the routes), so an API route with no screen is a list;
 *   - the API column of every row, from the component files the row names.
 *
 * A row is ticked only by a step of the recorded run that names it in `covers` (timeline.json); nobody ticks a row by hand.
 *
 * Usage:
 *   node scripts/walkthrough-run/coverage.mjs            write coverage-computed.json, controls.json and coverage-matrix.md to the output root
 *   node scripts/walkthrough-run/coverage.mjs --check    also exit 1 when a page or navigation entry has no row, a row names a file that does not exist, or any row is still `planned`
 *   node scripts/walkthrough-run/coverage.mjs --structure   the same, but a row that is still `planned` is allowed (the P0 and P1 gate: the plan is complete, the run is not done)
 */

import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { outputRoot, repoRoot } from "./paths.mjs";

const ROOT = repoRoot();
const SRC = path.join(ROOT, "src");
const OUT = outputRoot();
const args = new Set(process.argv.slice(2));

const rel = (file) => path.relative(ROOT, file).split(path.sep).join("/");
const isFile = (p) => {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
};
const read = (p) => fs.readFileSync(p, "utf-8");

function walk(dir, name) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walk(full, name));
    else if (entry.name === name) found.push(full);
  }
  return found.sort();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Pages and navigation
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------

const pageRoute = (file) => {
  const segments = path
    .relative(path.join(SRC, "app"), path.dirname(file))
    .split(path.sep)
    .filter((s) => s && !(s.startsWith("(") && s.endsWith(")")));
  return "/" + segments.join("/");
};

const pages = walk(path.join(SRC, "app"), "page.tsx")
  .filter((file) => !rel(file).startsWith("src/app/api/"))
  .map((file) => ({ route: pageRoute(file), file: rel(file), group: rel(file).includes("/(app)/") ? "school app" : "public" }));

// Octalve's navigation is a function of the school and the person's role there (`navFor`, src/components/shell/nav.ts), not a list: the entries are read from the source, each under the role
// branch (`school.role === "..."`) it sits in, and the same page under several roles is one entry that names them all. `${school.code}` is written [code], as a page route is.
const ROLE_NAMES = {
  ADMIN: "school administrator",
  CAMPUS_ADMIN: "campus administrator",
  TEACHING_STAFF: "teaching staff",
  NON_TEACHING_STAFF: "non-teaching staff",
  STUDENT: "pupil",
  PARENT: "guardian",
};
const navSource = read(path.join(SRC, "components/shell/nav.ts"));
const navFunction = navSource.slice(navSource.indexOf("export function navFor"), navSource.indexOf("export type NavGroup"));
const navEntries = new Map(); // href -> { label, roles: Set }
let navRoles = ["everyone"];
for (const line of navFunction.split("\n")) {
  // a line that opens a role branch: `if (school.role === "ADMIN") {` or `} else if (school.role === "A" || school.role === "B") {`
  if (/\bif \(school\.role === /.test(line))
    navRoles = [...line.matchAll(/school\.role === "(\w+)"/g)].map((m) => ROLE_NAMES[m[1]] ?? m[1]);
  for (const m of line.matchAll(/\{\s*label:\s*"([^"]+)",\s*href:\s*(null|`[^`]+`|"[^"]+")([^}]*)\}/g)) {
    const href = m[2] === "null" ? null : m[2].slice(1, -1).replaceAll("${school.code}", "[code]");
    const platformLine = href === "/platform";
    const roles = platformLine
      ? ["platform superadministrator"]
      : href === "/dashboard"
        ? ["a person with no school chosen yet"]
        : navRoles;
    const key = `${m[1]}|${href}`;
    if (!navEntries.has(key)) navEntries.set(key, { label: m[1], href, roles: new Set(), phoneMoreSheet: /inMore:\s*true/.test(m[3]) });
    for (const role of roles) navEntries.get(key).roles.add(role);
  }
}
const nav = [...navEntries.values()].map((e) => ({
  label: e.label,
  href: e.href,
  who: [...e.roles].join(", "),
  phoneMoreSheet: e.phoneMoreSheet,
}));

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// API routes, and who may call them (the function catalog)
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const routeUrl = (file) => "/api/" + path.relative(path.join(SRC, "app/api"), path.dirname(file)).split(path.sep).join("/");

const catalogAccess = new Map(); // "METHOD url" -> access text
for (const name of fs.readdirSync(path.join(ROOT, "docs/functions"))) {
  if (!name.endsWith(".md")) continue;
  for (const line of read(path.join(ROOT, "docs/functions", name)).split("\n")) {
    const m = line.match(/^\|\s*(GET|POST|PUT|PATCH|DELETE)\s*\|\s*`([^`]+)`\s*\|[^|]*\|\s*([^|]*?)\s*\|/);
    if (m) catalogAccess.set(`${m[1]} ${m[2]}`, m[3]);
  }
}

const apiRoutes = walk(path.join(SRC, "app/api"), "route.ts").map((file) => {
  const source = read(file);
  const methods = METHODS.filter(
    (method) =>
      new RegExp(`export\\s+(?:const|async\\s+function|function)\\s+${method}\\b`).test(source) ||
      new RegExp(`export\\s*\\{[^}]*\\bas\\s+${method}\\b`).test(source),
  );
  const url = routeUrl(file);
  return {
    url,
    file: rel(file),
    methods,
    access: Object.fromEntries(methods.map((m) => [m, catalogAccess.get(`${m} ${url}`) ?? null])),
    screens: [],
    shell: false,
  };
});

const segmentsOf = (url) => url.split("/").filter(Boolean);
/// Segment by segment: a fixed word in the route must be the same word in the reference (a `*`, a ${...}, never stands for one), a [param] takes anything, [...rest] takes the rest.
function routeMatches(route, ref) {
  const r = segmentsOf(route);
  const c = segmentsOf(ref);
  for (let i = 0; i < r.length; i++) {
    if (/^\[\[?\.\.\.[^\]]+\]\]?$/.test(r[i])) return c.length >= i;
    if (i >= c.length) return false;
    if (/^\[[^\]]+\]$/.test(r[i])) continue;
    if (c[i] !== r[i]) return false;
  }
  return r.length === c.length;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Import closure: which files a screen is made of, and which API routes they name
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------

const IMPORT_RE = /(?:import|export)\s[^;'"]*?from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
function resolveImport(from, spec) {
  let base;
  if (spec.startsWith("@/")) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")])
    if (isFile(candidate)) return candidate;
  return null;
}

const closureCache = new Map();
function closure(entry) {
  if (closureCache.has(entry)) return closureCache.get(entry);
  const seen = new Set();
  const queue = [entry];
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    for (const m of read(file).matchAll(IMPORT_RE)) {
      const next = resolveImport(file, m[1] ?? m[2]);
      if (next && !seen.has(next)) queue.push(next);
    }
  }
  const files = [...seen].sort();
  closureCache.set(entry, files);
  return files;
}

const API_REF_RE = /\/api\/[A-Za-z0-9_\-/[\]${}.]+/g;
function apiRefs(files) {
  const refs = new Set();
  for (const file of files) {
    for (const m of read(file).matchAll(API_REF_RE)) {
      const ref = m[0].replace(/\$\{[^}]*\}/g, "*").replace(/\/+$/, "");
      if (ref.length > "/api/".length) refs.add(ref);
    }
  }
  return [...refs].sort();
}

/// A reference matches a route when every segment agrees; a `*` (a ${...}) stands for any one segment of a dynamic route.
function matchRoutes(refs) {
  const matched = new Set();
  const unmatched = [];
  for (const ref of refs) {
    const hit = apiRoutes.filter((route) => routeMatches(route.url, ref));
    if (hit.length === 0) unmatched.push(ref);
    for (const route of hit) matched.add(route.url);
  }
  return { matched: [...matched].sort(), unmatched };
}

const shellEntries = ["src/app/layout.tsx", "src/app/(app)/layout.tsx"].map((p) => path.join(ROOT, p)).filter(isFile);
const shellFiles = new Set(shellEntries.flatMap(closure));
const shellRefs = matchRoutes(apiRefs([...shellFiles]));

const pageReport = pages.map((page) => {
  const files = closure(path.join(ROOT, page.file));
  const own = files.filter((f) => !shellFiles.has(f));
  const { matched, unmatched } = matchRoutes(apiRefs(own));
  return { ...page, files: own.map(rel), apiRoutes: matched, unmatchedReferences: unmatched };
});

for (const route of apiRoutes) {
  route.shell = shellRefs.matched.includes(route.url);
  route.screens = pageReport.filter((p) => p.apiRoutes.includes(route.url)).map((p) => p.route);
}

// A screen often builds a URL from a base and a suffix (`${base}/${id}/archive`), which the scan above cannot see. The weaker second level: the screen names the route's prefix
// as a whole URL AND every fixed word of the rest of the route as a path piece ("/archive"). It is a probable link, listed apart, never counted as a certain one.
const isDynamic = (segment) => /^\[.+\]$/.test(segment);
function builtFromParts(route, page) {
  const r = segmentsOf(route.url);
  const refs = page.allRefs;
  for (let k = r.length - 1; k >= 3; k--) {
    const tail = r.slice(k).filter((segment) => !isDynamic(segment));
    if (tail.length === 0) continue;
    const prefix = "/" + r.slice(0, k).join("/");
    if (!refs.some((ref) => routeMatches(prefix, ref))) continue;
    if (tail.every((word) => new RegExp(`/${word}(?![A-Za-z0-9_-])`).test(page.text))) return true;
  }
  return false;
}
const pageTexts = pageReport.map((page) => {
  const files = [...page.files, ...[...shellFiles].map(rel)];
  const text = files.map((f) => read(path.join(ROOT, f))).join("\n");
  return { route: page.route, text, allRefs: apiRefs(files.map((f) => path.join(ROOT, f))) };
});
for (const route of apiRoutes) {
  route.partialScreens =
    route.screens.length || route.shell ? [] : pageTexts.filter((page) => builtFromParts(route, page)).map((page) => page.route);
}

// What is left has no trace in any screen: routes the screens' own server code reaches by calling the functions directly, machine-to-machine routes (webhooks), and features
// that have an API and no screen. A person reads and classifies each one (findings.md).
const noScreen = apiRoutes
  .filter((route) => route.screens.length === 0 && route.partialScreens.length === 0 && !route.shell)
  .map((route) => ({ url: route.url, methods: route.methods, access: route.access }));
const probable = apiRoutes
  .filter((route) => route.partialScreens.length > 0)
  .map((route) => ({ url: route.url, methods: route.methods, screens: route.partialScreens }));

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// The controls a screen shows (a seed for writing the rows: read by a person, never a deliverable)
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------

const TEXT_RE = />\s*([A-Z][^<>{}=]{2,78}?)\s*</g;
const ATTR_RE = /\b(?:aria-label|label|title|placeholder)=\s*"([^"]{2,80})"/g;
function controlsOf(files) {
  const out = {};
  for (const file of files) {
    const source = read(path.join(ROOT, file));
    const found = new Set();
    for (const m of source.matchAll(TEXT_RE)) if (!/[;()=]|=>|\.\.\.|\bconst\b/.test(m[1])) found.add(m[1].replace(/\s+/g, " "));
    for (const m of source.matchAll(ATTR_RE)) found.add(`[${m[1]}]`);
    if (found.size) out[file] = [...found];
  }
  return out;
}
const controls = Object.fromEntries(pageReport.map((p) => [p.route, controlsOf(p.files)]));

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// The hand-written rows, and the ticks
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------

// WALKTHROUGH_ROWS_FILE lets the gate's own tests point it at a doctored copy.
const rowsFile = process.env.WALKTHROUGH_ROWS_FILE ?? path.join(ROOT, "tests/walkthrough/coverage/rows.json");
const rows = isFile(rowsFile) ? JSON.parse(read(rowsFile)) : [];
const timelineFile = path.join(OUT, "timeline.json");
const timeline = isFile(timelineFile) ? JSON.parse(read(timelineFile)) : [];
const ticked = new Set(timeline.flatMap((step) => step.covers ?? []));

const rowStatus = (row) => (row.status === "not-demonstrable" ? "not demonstrable" : ticked.has(row.id) ? "ticked" : "planned");

const ROLES = [
  "Visitor",
  "Platform superadmin",
  "School administrator",
  "Campus administrator",
  "Teacher",
  "Non-teaching staff",
  "Pupil",
  "Guardian",
];
const problems = [];
const ids = new Set();
for (const row of rows) {
  if (ids.has(row.id)) problems.push(`duplicate row id ${row.id}`);
  ids.add(row.id);
  for (const field of ["id", "area", "feature", "route", "roles", "proof", "kind"])
    if (row[field] === undefined || row[field] === "" || (Array.isArray(row[field]) && row[field].length === 0))
      problems.push(`row ${row.id ?? "?"} has no ${field}`);
  for (const role of row.roles ?? [])
    if (!ROLES.includes(role)) problems.push(`row ${row.id} names the role "${role}" (one of ${ROLES.join(", ")})`);
  if (!["positive", "negative"].includes(row.kind)) problems.push(`row ${row.id} has kind "${row.kind}" (positive or negative)`);
  if (row.status === "not-demonstrable" && !row.reason) problems.push(`row ${row.id} is not demonstrable but gives no reason`);
  for (const file of row.source ?? [])
    if (!isFile(path.join(ROOT, file))) problems.push(`row ${row.id} names ${file}, which does not exist`);
}
const allRoutes = new Set(rows.map((r) => r.route));
for (const page of pages) if (!allRoutes.has(page.route)) problems.push(`page ${page.route} has no row`);
for (const item of nav)
  if (item.href && !allRoutes.has(item.href)) problems.push(`navigation entry "${item.label}" (${item.href}) has no row`);
for (const row of rows)
  if (!pages.some((p) => p.route === row.route) && !row.route.startsWith("("))
    problems.push(`row ${row.id} names route ${row.route}, which is not a page`);

for (const row of rows) {
  const entry = row.source?.length ? row.source : (pageReport.find((p) => p.route === row.route)?.files.slice(0, 1) ?? []);
  // A row that names a file that does not exist is already a problem above; it must not also stop the scan.
  const files = entry.filter((f) => isFile(path.join(ROOT, f))).flatMap((f) => closure(path.join(ROOT, f)));
  row.api = matchRoutes(apiRefs(files)).matched;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------

fs.mkdirSync(OUT, { recursive: true });
const commit = execFileSync("git", ["-C", ROOT, "rev-parse", "--short", "HEAD"], { encoding: "utf-8" }).trim();
const generated = {
  commit,
  pages: pageReport,
  nav,
  shell: { files: [...shellFiles].map(rel), apiRoutes: shellRefs.matched, unmatchedReferences: shellRefs.unmatched },
  apiRoutes,
  noScreen,
  probable,
};
fs.writeFileSync(path.join(OUT, "coverage-computed.json"), JSON.stringify(generated, null, 2));
fs.writeFileSync(path.join(OUT, "controls.json"), JSON.stringify(controls, null, 2));

const cell = (text) =>
  String(text ?? "")
    .replaceAll("|", "\\|")
    .replaceAll("\n", " ");
const counts = { planned: 0, ticked: 0, "not demonstrable": 0 };
for (const row of rows) counts[rowStatus(row)]++;

const lines = [];
lines.push(`# Octalve Edu walkthrough: coverage matrix`, "");
lines.push(
  `Commit ${commit}. Generated by scripts/walkthrough-run/coverage.mjs from the code and tests/walkthrough/coverage/rows.json; the status column is computed from timeline.json, never edited by hand.`,
  "",
);
lines.push(
  `**${rows.length} rows:** ${counts.ticked} ticked, ${counts.planned} planned, ${counts["not demonstrable"]} not demonstrable. ${pages.length} pages, ${nav.length} navigation entries, ${apiRoutes.length} API routes (${apiRoutes.length - noScreen.length - probable.length - apiRoutes.filter((r) => r.screens.length === 0 && r.partialScreens.length === 0 && r.shell).length} reached by a screen, ${probable.length} probably, ${noScreen.length} with no trace of a screen).`,
  "",
);
lines.push(
  `| Row | Area | Feature | Route | Roles | Kind | The click that proves it | API routes behind it | Status |`,
  `|---|---|---|---|---|---|---|---|---|`,
);
for (const row of rows) {
  const api = row.api.length ? row.api.map((u) => u.replace("/api/v1", "")).join("<br>") : "none";
  const status = rowStatus(row) + (row.status === "not-demonstrable" ? `: ${row.reason}` : "");
  lines.push(
    `| ${cell(row.id)} | ${cell(row.area)} | ${cell(row.feature)} | ${cell(row.route)} | ${cell(row.roles.join(", "))} | ${row.kind} | ${cell(row.proof)} | ${api} | ${cell(status)} |`,
  );
}
lines.push(
  "",
  `## Pages with no row`,
  "",
  problems
    .filter((p) => p.startsWith("page "))
    .map((p) => `- ${p}`)
    .join("\n") || "none",
  "",
);
lines.push(
  `## API routes with no screen (${noScreen.length})`,
  "",
  `A route no screen names is either a feature without a way to reach it (a finding), a machine-to-machine route (webhook, cron, health), or called through a path this scan cannot see. Each one is read and classified in findings.md.`,
  "",
);
lines.push(`| Route | Methods | Who may call it (function catalog) |`, `|---|---|---|`);
for (const route of noScreen)
  lines.push(
    `| ${cell(route.url)} | ${route.methods.join(", ")} | ${cell(Object.values(route.access).find(Boolean) ?? "not in the catalog")} |`,
  );
fs.writeFileSync(path.join(OUT, "coverage-matrix.md"), lines.join("\n") + "\n");

console.log(
  `coverage: ${rows.length} rows (${counts.ticked} ticked, ${counts.planned} planned, ${counts["not demonstrable"]} not demonstrable); ${pages.length} pages; ${nav.length} nav entries; ${apiRoutes.length} API routes, ${noScreen.length} with no screen`,
);
console.log(`written to ${OUT}`);
for (const problem of problems) console.log(`  PROBLEM: ${problem}`);

if (args.has("--check") || args.has("--structure")) {
  const failing = [...problems];
  if (args.has("--check") && counts.planned > 0) failing.push(`${counts.planned} rows are still planned`);
  if (failing.length) {
    for (const problem of failing) console.error(`  ${problem}`);
    console.error(`coverage check failed: ${failing.length} problem(s)`);
    process.exit(1);
  }
  console.log("coverage check passed");
}
