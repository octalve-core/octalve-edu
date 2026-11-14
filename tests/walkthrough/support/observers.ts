import type { BrowserContext, Page, Request } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import * as fs from "fs";
import * as path from "path";

/**
 * Observers: listeners that watch the run and never change what the app does (the rule's "actors versus observers"). They are always on.
 *
 * What they record, and how it is judged:
 *   blocker  a script error on the page, a console error, a 5xx response, a request that tried to leave this machine, an accessibility violation of impact serious or critical
 *   listed   a console warning, a 4xx response (a refusal is expected where the journey provokes one), a failed request, an accessibility violation of lower impact
 * A strict run fails on any blocker; a recon run only records them. Either way the list is evidence for findings.md.
 */

export type ObservationKind =
  "console-error" | "console-warning" | "page-error" | "request-failed" | "http-error" | "external-request" | "axe";
export type Severity = "blocker" | "listed";

export interface Observation {
  kind: ObservationKind;
  severity: Severity;
  /// The id of the step that was running, or null before the first step.
  step: number | null;
  /// The page path when it happened.
  route: string;
  detail: string;
  /// axe only: the rule id and its impact.
  rule?: string;
  impact?: string;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/// Whether a request stays on this machine. data:, blob: and about: never leave it.
export function staysOnThisMachine(url: string): boolean {
  if (/^(data|blob|about):/i.test(url)) return true;
  return LOCAL_HOSTS.has(new URL(url).hostname);
}

const routeOf = (page: Page): string => {
  const url = page.url();
  return /^https?:/.test(url) ? new URL(url).pathname : url.slice(0, 30);
};

export class Observers {
  readonly observations: Observation[] = [];
  private step: number | null = null;
  private scanned = new Set<string>();
  /// True between walk.goOffline() and walk.goOnline(): the browser's own "network is down" console lines are then expected and only listed.
  private offline = false;

  /// The tabs that already have the listeners below (a tab is listened to once, however many times the walk comes back to it).
  private readonly listening = new WeakSet<Page>();

  constructor(private page: Page) {}

  /// Moves the observers to another tab of the same browser context (a typed-address tab, or back to the first tab): its console, errors, failed requests and responses are listened to
  /// from now on, and the accessibility scan reads it.
  follow(page: Page): void {
    this.page = page;
    this.listen(page);
  }

  setStep(id: number | null): void {
    this.step = id;
  }

  setOffline(offline: boolean): void {
    this.offline = offline;
  }

  private add(
    kind: ObservationKind,
    severity: Severity,
    detail: string,
    extra: Pick<Observation, "rule" | "impact"> = {},
    page: Page = this.page,
  ): void {
    this.observations.push({ kind, severity, step: this.step, route: routeOf(page), detail: detail.slice(0, 400), ...extra });
  }

  /// Attaches the listeners and refuses (and records) any request that would leave this machine. Call once, before the first page load.
  async start(context: BrowserContext): Promise<void> {
    this.listen(this.page);
    await context.route("**/*", (route) => {
      const url = route.request().url();
      if (staysOnThisMachine(url)) return route.continue();
      this.add("external-request", "blocker", `the app calls ${url}`);
      return route.abort("blockedbyclient");
    });
  }

  private listen(page: Page): void {
    if (this.listening.has(page)) return;
    this.listening.add(page);
    page.on("console", (message) => {
      const text = message.text();
      if (message.type() === "error") {
        // The browser logs every 4xx/5xx response as a console error too; the response listener below judges those by their status.
        // The same for the line the browser writes when the network is down on purpose (OFF-01); outside that period it is a real failure.
        const isResponseNoise =
          /Failed to load resource: the server responded with a status of [45]\d\d/.test(text) ||
          (this.offline && /net::ERR_INTERNET_DISCONNECTED/.test(text));
        this.add("console-error", isResponseNoise ? "listed" : "blocker", text, {}, page);
      } else if (message.type() === "warning") this.add("console-warning", "listed", text, {}, page);
    });
    page.on("pageerror", (error) => this.add("page-error", "blocker", error.message, {}, page));
    page.on("requestfailed", (request: Request) => {
      const reason = request.failure()?.errorText ?? "failed";
      // Next.js cancels the prefetch of a page (`?_rsc=`) when the person has already moved on: a cancelled prefetch is the framework working, not a failed request.
      if (reason === "net::ERR_ABORTED" && /[?&]_rsc=/.test(request.url())) return;
      this.add("request-failed", "listed", `${request.method()} ${request.url()}: ${reason}`, {}, page);
    });
    page.on("response", (response) => {
      const status = response.status();
      if (status >= 400)
        this.add(
          "http-error",
          status >= 500 ? "blocker" : "listed",
          `${status} ${response.request().method()} ${response.url()}`,
          {},
          page,
        );
    });
  }

  /// An accessibility scan of the page as it is now, once per path. Serious and critical violations are blockers; the rest are listed.
  async axeOnNewRoute(): Promise<void> {
    const route = routeOf(this.page);
    if (!/^https?:/.test(this.page.url()) || this.scanned.has(route)) return;
    this.scanned.add(route);
    await this.scan();
  }

  async scan(): Promise<void> {
    const results = await new AxeBuilder({ page: this.page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    for (const violation of results.violations) {
      const impact = violation.impact ?? "minor";
      this.add(
        "axe",
        impact === "serious" || impact === "critical" ? "blocker" : "listed",
        `${violation.id}: ${violation.help} (${violation.nodes.length} element(s))`,
        {
          rule: violation.id,
          impact,
        },
      );
    }
  }

  blockers(): Observation[] {
    return this.observations.filter((o) => o.severity === "blocker");
  }

  save(file: string): void {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(this.observations, null, 2));
  }
}
