import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Reporter, TestCase, TestResult } from "@playwright/test/reporter";
import { readBaseline, type ScanRecord } from "./baseline.js";
import { baselinePath, KEYBOARD_ANNOTATION, SCAN_ATTACHMENT } from "./constants.js";
import { renderMarkdown, type KeyboardResult, type Report } from "./report.js";
import { VERSION } from "./version.js";

interface Attempt { scans: ScanRecord[]; keyboard: KeyboardResult | null }

export default class A11yReporter implements Reporter {
  private readonly outputDir: string;
  private readonly attempts = new Map<string, Attempt>();

  constructor(options: { outputDir?: string } = {}) {
    this.outputDir = options.outputDir ?? "a11y-report";
  }

  printsToStdio(): boolean {
    return false;
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const scans = result.attachments
      .filter((a) => a.name === SCAN_ATTACHMENT && a.body)
      .map((a) => JSON.parse(a.body!.toString("utf8")) as ScanRecord);
    const annotations = (result as TestResult & { annotations?: TestCase["annotations"] }).annotations ?? test.annotations;
    const checks = annotations.filter((a) => a.type === KEYBOARD_ANNOTATION).map((a) => a.description ?? "");
    const project = test.parent.project()?.name ?? "default";
    const keyboard = checks.length ? { test: test.title, project, checks, status: result.status } : null;
    this.attempts.set(test.id, { scans, keyboard });
  }

  async onEnd(): Promise<{ status: "failed" } | undefined> {
    const scans = [...this.attempts.values()].flatMap((a) => a.scans);
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const s of scans) {
      const key = `${s.page}\u0001${s.project}`;
      if (seen.has(key)) duplicates.push(`The scan name "${s.page}" [${s.project}] is used more than one time.`);
      seen.add(key);
    }
    const report: Report = {
      date: new Date().toISOString().slice(0, 10),
      packageVersion: VERSION,
      axeVersion: scans[0]?.axeVersion ?? "not run",
      scans,
      keyboard: [...this.attempts.values()].flatMap((a) => (a.keyboard ? [a.keyboard] : [])),
      baseline: readBaseline(baselinePath()),
      duplicates,
    };
    mkdirSync(this.outputDir, { recursive: true });
    writeFileSync(join(this.outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(join(this.outputDir, "report.md"), renderMarkdown(report));
    return duplicates.length ? { status: "failed" } : undefined;
  }
}
