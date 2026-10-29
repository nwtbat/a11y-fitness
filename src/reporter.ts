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

export default class A11yReporter implements Reporter {
  private readonly outputDir: string;
  /** One entry for each test, by its title path and project. A retry or a repeat (repeatEach) replaces the earlier one. */
  private readonly attempts = new Map<string, Attempt>();
  private shard: Shard | null = null;
  private grepProblem: string | null = null;

  constructor(options: { outputDir?: string } = {}) {
    this.outputDir = options.outputDir ?? "a11y-report";
  }

  printsToStdio(): boolean {
    return false;
  }

  onBegin(config: FullConfig): void {
    this.shard = config.shard ? { current: config.shard.current, total: config.shard.total } : null;
    if (!isDefaultGrep(config.grep) || (config.grepInvert !== null && config.grepInvert !== undefined))
      this.grepProblem = "The run used --grep or --grep-invert. This report does not include all tests.";
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
      problems: [...(this.grepProblem ? [this.grepProblem] : []), ...attempts.flatMap((a) => a.problems)],
      runStatus: result?.status ?? null,
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
