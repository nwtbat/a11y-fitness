import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { FullConfig, FullResult, Reporter, TestCase, TestResult } from "@playwright/test/reporter";
import { readBaseline, type ScanRecord } from "./baseline.js";
import { baselinePath, KEYBOARD_ANNOTATION, SCAN_ATTACHMENT } from "./constants.js";
import { renderMarkdown, sortReport, type KeyboardResult, type Report, type Shard } from "./report.js";
import { VERSION } from "./version.js";

interface Attempt { scans: ScanRecord[]; keyboard: KeyboardResult | null; problems: string[] }

const isDefaultGrep = (grep: FullConfig["grep"] | undefined) =>
  grep === undefined || (Array.isArray(grep) ? grep : [grep]).every((r) => r.source === ".*" || r.source === "(?:)");

// Options that take a value. The value is not a file filter.
const VALUE_OPTIONS = new Set(["-c", "--config", "--reporter", "-j", "--workers", "--shard", "--project", "-g", "--grep",
  "--grep-invert", "--retries", "--repeat-each", "--timeout", "--global-timeout", "--max-failures", "--output",
  "--trace", "--browser", "--tsconfig", "--update-source-method"]);
// Options with an optional value.
const OPTIONAL_VALUES: Record<string, Set<string>> = {
  "-u": new Set(["all", "changed", "missing", "none"]),
  "--update-snapshots": new Set(["all", "changed", "missing", "none"]),
};
const FILTERS: Record<string, string> = {
  "-g": "--grep", "--grep": "--grep", "--grep-invert": "--grep-invert", "--last-failed": "--last-failed",
  "--only-changed": "--only-changed", "--project": "--project",
};

/** The filter options of a `playwright test` command line, in the order of the command line. */
export function argvFilters(argv: string[]): string[] {
  const start = argv.indexOf("test");
  if (start < 0) return [];
  const found: string[] = [];
  const add = (name: string) => { if (!found.includes(name)) found.push(name); };
  const args = argv.slice(start + 1);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const name = arg.startsWith("--") ? arg.split("=")[0] : arg;
    if (!arg.startsWith("-")) { add("file filter"); continue; }
    if (FILTERS[name]) add(FILTERS[name]);
    if (arg.includes("=")) continue;
    if (VALUE_OPTIONS.has(name)) i++;
    else if (name === "--only-changed" && args[i + 1] && !args[i + 1].startsWith("-")) i++;
    else if (OPTIONAL_VALUES[name]?.has(args[i + 1] ?? "")) i++;
  }
  return found;
}

export default class A11yReporter implements Reporter {
  private readonly outputDir: string;
  /** One entry for each test, by its title path and project. A retry or a repeat (repeatEach) replaces the earlier one. */
  private readonly attempts = new Map<string, Attempt>();
  private shard: Shard | null = null;
  private filterProblem: string | null = null;

  constructor(options: { outputDir?: string } = {}) {
    this.outputDir = options.outputDir ?? "a11y-report";
  }

  printsToStdio(): boolean {
    return false;
  }

  onBegin(config: FullConfig): void {
    this.shard = config.shard ? { current: config.shard.current, total: config.shard.total } : null;
    const filters = argvFilters(process.argv);
    const configGrep = !isDefaultGrep(config.grep) || (config.grepInvert !== null && config.grepInvert !== undefined);
    if (configGrep && !filters.includes("--grep") && !filters.includes("--grep-invert")) filters.push("grep in the config");
    if (filters.length) this.filterProblem = `This report is for a filtered run only (${filters.join(", ")}).`;
    for (const name of ["report.md", "report.json"]) rmSync(join(this.outputDir, name), { force: true });
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const project = test.parent.project()?.name ?? "default";
    const problems: string[] = [];
    const scans: ScanRecord[] = [];
    for (const a of result.attachments) {
      if (a.name !== SCAN_ATTACHMENT || !a.body) continue;
      try {
        scans.push(JSON.parse(a.body.toString("utf8")) as ScanRecord);
      } catch {
        problems.push(`The test "${test.title}" [${project}] has a scan attachment that is not valid JSON. The report does not include it.`);
      }
    }
    const annotations = (result as TestResult & { annotations?: TestCase["annotations"] }).annotations ?? test.annotations;
    const checks = annotations.filter((a) => a.type === KEYBOARD_ANNOTATION).map((a) => a.description ?? "");
    const keyboard = checks.length ? { test: test.title, project, checks, status: result.status } : null;
    this.attempts.set(`${test.titlePath().join("\u0001")}\u0002${project}`, { scans, keyboard, problems });
  }

  async onEnd(result?: FullResult): Promise<{ status: "failed" } | undefined> {
    const attempts = [...this.attempts.values()];
    const scans = attempts.flatMap((a) => a.scans);
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const s of scans) {
      const key = `${s.page}\u0001${s.project}`;
      if (seen.has(key)) duplicates.push(`The scan name "${s.page}" [${s.project}] is used more than one time.`);
      seen.add(key);
    }
    const report = sortReport({
      date: new Date().toISOString().slice(0, 10),
      packageVersion: VERSION,
      axeVersion: scans[0]?.axeVersion ?? "not run",
      scans,
      keyboard: attempts.flatMap((a) => (a.keyboard ? [a.keyboard] : [])),
      baseline: readBaseline(baselinePath()),
      duplicates,
      problems: [...(this.filterProblem ? [this.filterProblem] : []), ...attempts.flatMap((a) => a.problems)],
      runStatus: duplicates.length ? "failed" : result?.status ?? null,
      shard: this.shard,
    });
    mkdirSync(this.outputDir, { recursive: true });
    this.write("report.json", `${JSON.stringify(report, null, 2)}\n`);
    this.write("report.md", renderMarkdown(report));
    return duplicates.length ? { status: "failed" } : undefined;
  }

  private write(name: string, content: string): void {
    const path = join(this.outputDir, name);
    writeFileSync(`${path}.tmp`, content);
    renameSync(`${path}.tmp`, path);
  }
}
