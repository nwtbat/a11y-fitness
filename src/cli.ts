#!/usr/bin/env node
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import {
  acceptEntry, BaselineError, checkGrowth, initBaseline, pruneBaseline, readBaseline, writeBaseline, type ScanRecord,
} from "./baseline.js";
import { problemLines, type Report } from "./report.js";

type IO = { out: (s: string) => void; err: (s: string) => void };
const USAGE = "Usage: a11y-fitness baseline init|prune|accept|check [options]";

function readReport(path: string): { scans: ScanRecord[]; problems: string[] } {
  if (!existsSync(path)) throw new BaselineError(`${path} does not exist. Run the Playwright tests first.`);
  const report = JSON.parse(readFileSync(path, "utf8")) as Partial<Report> & { scans: ScanRecord[] };
  // The same lines as "**Problems:**" in report.md. An older report can lack the fields.
  const problems = problemLines({
    ...(report as Report),
    runStatus: report.runStatus ?? null, shard: report.shard ?? null,
    duplicates: report.duplicates ?? [], problems: report.problems ?? [],
  });
  return { scans: report.scans, problems };
}
const readScans = (path: string): ScanRecord[] => readReport(path).scans;

/** Reads the report, and gives a warning for each problem of the run before the command acts. */
function readScansWithWarnings(path: string, io: IO): ScanRecord[] {
  const { scans, problems } = readReport(path);
  problems.forEach((p) => io.err(`Warning: ${p}`));
  return scans;
}

const elements = (entries: { count: number }[]) => entries.reduce((n, e) => n + e.count, 0);

export function run(argv: string[], io: IO): number {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv, allowPositionals: true, strict: true,
      options: {
        baseline: { type: "string", default: process.env.A11Y_BASELINE ?? "a11y-baseline.json" },
        report: { type: "string", default: "a11y-report/report.json" },
        against: { type: "string" }, page: { type: "string" }, project: { type: "string" },
        target: { type: "string" }, reason: { type: "string" },
      },
    });
  } catch (error) {
    // parseArgs gives a TypeError for an unknown option or an option without a value.
    io.err((error as Error).message);
    io.err(USAGE);
    return 1;
  }
  const { values, positionals } = parsed;
  const [group, command, rule] = positionals;
  const baselineFile = resolve(values.baseline!);
  const reportFile = resolve(values.report!);
  try {
    if (group !== "baseline") throw new BaselineError(USAGE);
    switch (command) {
      case "init": {
        if (existsSync(baselineFile)) throw new BaselineError(`${baselineFile} exists. Use "baseline prune" or "baseline accept".`);
        const baseline = initBaseline(readScansWithWarnings(reportFile, io));
        writeBaseline(baselineFile, baseline);
        io.out(`Wrote ${baseline.entries.length} entries for ${elements(baseline.entries)} elements to ${baselineFile}.`);
        return 0;
      }
      case "prune": {
        const before = readBaseline(baselineFile);
        const after = pruneBaseline(before, readScansWithWarnings(reportFile, io));
        writeBaseline(baselineFile, after);
        io.out(`Removed ${elements(before.entries) - elements(after.entries)} fixed elements from ${baselineFile}.`);
        return 0;
      }
      case "accept": {
        if (!rule || !values.page || !values.project || !values.target || !values.reason) {
          throw new BaselineError("accept needs a rule, and accept needs --page, --project, --target, and --reason.");
        }
        const after = acceptEntry(readBaseline(baselineFile),
          { page: values.page, project: values.project, rule, target: values.target, reason: values.reason });
        writeBaseline(baselineFile, after);
        io.out(`Accepted ${rule} on "${values.page}" [${values.project}] at ${values.target}.`);
        return 0;
      }
      case "check": {
        if (!values.against) throw new BaselineError("check needs --against <the baseline file of the target branch>.");
        const problems = checkGrowth(readBaseline(resolve(values.against)), readBaseline(baselineFile));
        problems.forEach((p) => io.err(p));
        if (existsSync(reportFile)) {
          const fixed = elements(readScans(reportFile).flatMap((s) => s.fixed));
          if (fixed) io.out(`${fixed} elements in the baseline are fixed. Run "a11y-fitness baseline prune".`);
        }
        return problems.length ? 1 : 0;
      }
      default:
        throw new BaselineError(USAGE);
    }
  } catch (error) {
    if (error instanceof BaselineError) {
      io.err(error.message);
      return 1;
    }
    throw error;
  }
}

// Resolve the symlink that npm makes in node_modules/.bin, so that "npx a11y-fitness" runs the command.
const isMain = (): boolean => {
  try {
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1] ?? "")).href;
  } catch {
    return false;
  }
};

if (isMain()) {
  process.exitCode = run(process.argv.slice(2), { out: console.log, err: console.error });
}
