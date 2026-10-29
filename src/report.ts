import type { Baseline, BaselineEntry, Finding, ScanRecord } from "./baseline.js";
import { WCAG_TAGS } from "./constants.js";

export interface KeyboardResult { test: string; project: string; checks: string[]; status: string }
export interface Shard { current: number; total: number }
export interface Report {
  date: string; packageVersion: string; axeVersion: string; scans: ScanRecord[];
  keyboard: KeyboardResult[]; baseline: Baseline; duplicates: string[];
  /** Other problems of the run: malformed attachments, a --grep run. */
  problems: string[];
  /** The status that Playwright gives at the end of the run, or null when it is not known. */
  runStatus: string | null;
  shard: Shard | null;
}

const by = (...values: string[]) => values;
const compareKeys = (a: string[], b: string[]) => {
  for (let i = 0; i < a.length; i++) {
    const c = a[i].localeCompare(b[i], "en");
    if (c !== 0) return c;
  }
  return 0;
};
const sorted = <T>(items: T[], key: (item: T) => string[]) => [...items].sort((a, b) => compareKeys(key(a), key(b)));
const findingKey = (f: Finding) => by(f.page, f.project, f.rule, f.target, f.html);
const entryKey = (e: BaselineEntry) => by(e.page, e.project, e.rule, e.target);

/** Sorts the scans, the findings in each scan, and the keyboard rows, so that the output is stable. */
export function sortReport(report: Report): Report {
  return {
    ...report,
    scans: sorted(report.scans, (s) => by(s.page, s.project)).map((s) => ({
      ...s,
      findings: sorted(s.findings, findingKey),
      fresh: sorted(s.fresh, findingKey),
      known: sorted(s.known, findingKey),
      fixed: sorted(s.fixed, entryKey),
    })),
    keyboard: sorted(report.keyboard, (k) => by(k.test, k.project, k.status)),
  };
}

// Order matters: the backslash first, so that the later escapes are not escaped again.
const cell = (value: string | number | null) =>
  String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/[`*_[\]]/g, (c) => `\\${c}`)
    .replace(/\s*\n\s*/g, " ");
const row = (cells: (string | number | null)[]) => `| ${cells.map(cell).join(" | ")} |`;

function table(head: string[], rows: (string | number | null)[][]): string {
  if (rows.length === 0) return "None.\n";
  return [row(head), `|${head.map(() => "---").join("|")}|`, ...rows.map(row)].join("\n") + "\n";
}

const findingRows = (findings: Finding[]) =>
  findings.map((f) => [f.page, f.project, f.rule, f.impact, f.target, f.help]);

export function problemLines(report: Report): string[] {
  const lines: string[] = [];
  if (report.runStatus !== null && report.runStatus !== "passed") lines.push(`The run status is "${report.runStatus}".`);
  if (report.shard) lines.push(`This report is for shard ${report.shard.current} of ${report.shard.total} only.`);
  return [...lines, ...report.duplicates, ...report.problems];
}

export function renderMarkdown(input: Report): string {
  const report = sortReport(input);
  const scans = report.scans;
  const entries = report.baseline.entries;
  const elements = entries.reduce((n, e) => n + e.count, 0);
  const out: string[] = [
    "# Accessibility report\n",
    `Date: ${report.date}. Package: @nwtbat/a11y-fitness ${report.packageVersion}. Engine: axe-core ${report.axeVersion}.\n`,
    `Standard: WCAG 2.2 level A and AA (axe tags ${WCAG_TAGS.join(", ")}).\n`,
  ];
  const problems = problemLines(report);
  if (problems.length) out.push(`**Problems:** ${problems.map(cell).join(" ")}\n`);
  out.push("## Summary\n", table(["Page", "Project", "New", "Known", "Fixed"],
    scans.map((s) => [s.page, s.project, s.fresh.length, s.known.length, s.fixed.reduce((n, e) => n + e.count, 0)])));
  out.push("## New violations\n", table(["Page", "Project", "Rule", "Impact", "Element", "Help"], findingRows(scans.flatMap((s) => s.fresh))));
  out.push("## Known violations\n", table(["Page", "Project", "Rule", "Impact", "Element", "Help"], findingRows(scans.flatMap((s) => s.known))));
  out.push("## Fixed\n", table(["Page", "Project", "Rule", "Element", "Count"],
    scans.flatMap((s) => s.fixed.map((e) => [e.page, e.project, e.rule, e.target, e.count]))));
  out.push("## Keyboard tests\n", table(["Test", "Project", "Checks", "Result"],
    report.keyboard.map((k) => [k.test, k.project, k.checks.join("; "), k.status])));
  out.push("## Baseline\n", `The baseline has ${entries.length} entries for ${elements} elements.\n`);
  out.push("### Accepted entries\n", table(["Page", "Project", "Rule", "Element", "Reason"],
    sorted(entries.filter((e) => e.reason), entryKey).map((e) => [e.page, e.project, e.rule, e.target, e.reason])));
  out.push("## Disabled rules\n", table(["Page", "Project", "Rule", "Reason"],
    scans.flatMap((s) => Object.entries(s.disabled).sort(([a], [b]) => a.localeCompare(b, "en")).map(([rule, reason]) => [s.page, s.project, rule, reason]))));
  return out.join("\n");
}
