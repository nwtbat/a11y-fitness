import { existsSync, readFileSync, writeFileSync } from "node:fs";

export interface Finding {
  page: string; project: string; rule: string; target: string;
  impact: string | null; help: string; helpUrl: string; html: string;
}
export interface BaselineEntry { page: string; project: string; rule: string; target: string; count: number; reason: string }
export interface Baseline { version: 1; entries: BaselineEntry[] }
export interface Comparison { fresh: Finding[]; known: Finding[]; fixed: BaselineEntry[] }
export interface ScanRecord {
  page: string; project: string; findings: Finding[]; fresh: Finding[]; known: Finding[];
  fixed: BaselineEntry[]; disabled: Record<string, string>; axeVersion: string;
}
type Key = { page: string; project: string; rule: string; target: string };

export class BaselineError extends Error {}

export const keyOf = (k: Key): string => [k.page, k.project, k.rule, k.target].join("\u0001");
export const emptyBaseline = (): Baseline => ({ version: 1, entries: [] });

const FIELDS = ["page", "project", "rule", "target", "reason"] as const;

export function readBaseline(path: string): Baseline {
  if (!existsSync(path)) return emptyBaseline();
  const bad = (why: string) => new BaselineError(`${path} is not a valid baseline: ${why}`);
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw bad(`${(error as Error).message}.`);
  }
  const entries = (data as { entries?: unknown }).entries;
  if (!Array.isArray(entries)) throw bad('there is no "entries" list.');
  entries.forEach((e, i) => {
    for (const field of FIELDS) if (typeof e?.[field] !== "string") throw bad(`entry ${i + 1} has no ${field}.`);
    if (!Number.isInteger(e.count) || e.count < 1) throw bad(`entry ${i + 1} has no count.`);
  });
  return { version: 1, entries: entries as BaselineEntry[] };
}

function sorted(entries: BaselineEntry[]): BaselineEntry[] {
  return [...entries].sort((a, b) => (keyOf(a) < keyOf(b) ? -1 : keyOf(a) > keyOf(b) ? 1 : 0));
}

export function writeBaseline(path: string, baseline: Baseline): void {
  const entries = sorted(baseline.entries).map((e) => ({
    page: e.page, project: e.project, rule: e.rule, target: e.target, count: e.count, reason: e.reason,
  }));
  writeFileSync(path, `${JSON.stringify({ version: 1, entries }, null, 2)}\n`);
}

function countKeys(findings: Finding[]): Map<string, { key: Key; findings: Finding[] }> {
  const groups = new Map<string, { key: Key; findings: Finding[] }>();
  for (const finding of findings) {
    const k = keyOf(finding);
    if (!groups.has(k)) groups.set(k, { key: finding, findings: [] });
    groups.get(k)!.findings.push(finding);
  }
  return groups;
}

export function compare(findings: Finding[], baseline: Baseline, page: string, project: string): Comparison {
  const mine = baseline.entries.filter((e) => e.page === page && e.project === project);
  const allowed = new Map(mine.map((e) => [keyOf(e), e.count]));
  const groups = countKeys(findings);
  const fresh: Finding[] = [];
  const known: Finding[] = [];
  for (const [k, group] of groups) {
    const limit = allowed.get(k) ?? 0;
    known.push(...group.findings.slice(0, limit));
    fresh.push(...group.findings.slice(limit));
  }
  const fixed: BaselineEntry[] = [];
  for (const e of mine) {
    const seen = groups.get(keyOf(e))?.findings.length ?? 0;
    if (seen < e.count) fixed.push({ ...e, count: e.count - seen });
  }
  return { fresh, known, fixed };
}

export function initBaseline(scans: ScanRecord[]): Baseline {
  const entries: BaselineEntry[] = [];
  for (const { key, findings } of countKeys(scans.flatMap((s) => s.findings)).values()) {
    entries.push({ page: key.page, project: key.project, rule: key.rule, target: key.target, count: findings.length, reason: "" });
  }
  return { version: 1, entries: sorted(entries) };
}

export function pruneBaseline(baseline: Baseline, scans: ScanRecord[]): Baseline {
  const scanned = new Set(scans.map((s) => `${s.page}\u0001${s.project}`));
  const seen = countKeys(scans.flatMap((s) => s.findings));
  const entries: BaselineEntry[] = [];
  for (const e of baseline.entries) {
    if (!scanned.has(`${e.page}\u0001${e.project}`)) {
      entries.push(e);
      continue;
    }
    const count = Math.min(e.count, seen.get(keyOf(e))?.findings.length ?? 0);
    if (count > 0) entries.push({ ...e, count });
  }
  return { version: 1, entries: sorted(entries) };
}

export function acceptEntry(baseline: Baseline, entry: Key & { reason: string }): Baseline {
  const reason = entry.reason.trim();
  if (!reason) throw new BaselineError("Give a reason with --reason.");
  const k = keyOf(entry);
  const found = baseline.entries.find((e) => keyOf(e) === k);
  const entries = found
    ? baseline.entries.map((e) => (e === found ? { ...e, count: e.count + 1, reason } : e))
    : [...baseline.entries, { page: entry.page, project: entry.project, rule: entry.rule, target: entry.target, count: 1, reason }];
  return { version: 1, entries: sorted(entries) };
}

export function checkGrowth(base: Baseline, current: Baseline): string[] {
  const before = new Map(base.entries.map((e) => [keyOf(e), e.count]));
  const problems: string[] = [];
  for (const e of current.entries) {
    const was = before.get(keyOf(e)) ?? 0;
    if (e.count > was && e.reason.trim() === "") {
      problems.push(`${e.page} [${e.project}] ${e.rule} at ${e.target}: the baseline grew from ${was} to ${e.count} without a reason. Use "a11y-fitness baseline accept".`);
    }
  }
  return problems;
}
