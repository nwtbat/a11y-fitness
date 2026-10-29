import type { Baseline, Finding, ScanRecord } from "./baseline.js";
import { WCAG_TAGS } from "./constants.js";

export interface KeyboardResult { test: string; project: string; checks: string[]; status: string }
export interface Report {
  date: string; packageVersion: string; axeVersion: string; scans: ScanRecord[];
  keyboard: KeyboardResult[]; baseline: Baseline; duplicates: string[];
}

const cell = (value: string | number | null) => String(value ?? "").replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");
const row = (cells: (string | number | null)[]) => `| ${cells.map(cell).join(" | ")} |`;

function table(head: string[], rows: (string | number | null)[][]): string {
  if (rows.length === 0) return "None.\n";
  return [row(head), `|${head.map(() => "---").join("|")}|`, ...rows.map(row)].join("\n") + "\n";
}

const findingRows = (findings: Finding[]) =>
  findings.map((f) => [f.page, f.project, f.rule, f.impact, f.target, f.help]);

export function renderMarkdown(report: Report): string {
  const scans = [...report.scans].sort((a, b) => `${a.page}${a.project}`.localeCompare(`${b.page}${b.project}`));
  const entries = report.baseline.entries;
  const elements = entries.reduce((n, e) => n + e.count, 0);
  const out: string[] = [
    "# Accessibility report\n",
    `Date: ${report.date}. Package: @nwtbat/a11y-fitness ${report.packageVersion}. Engine: axe-core ${report.axeVersion}.\n`,
    `Standard: WCAG 2.2 level A and AA (axe tags ${WCAG_TAGS.join(", ")}).\n`,
  ];
  if (report.duplicates.length) out.push("## Problems\n", report.duplicates.map((d) => `- ${d}`).join("\n") + "\n");
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
    entries.filter((e) => e.reason).map((e) => [e.page, e.project, e.rule, e.target, e.reason])));
  out.push("## Disabled rules\n", table(["Page", "Project", "Rule", "Reason"],
    scans.flatMap((s) => Object.entries(s.disabled).map(([rule, reason]) => [s.page, s.project, rule, reason]))));
  return out.join("\n");
}
