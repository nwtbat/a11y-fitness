import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { run } from "./cli.js";

let dir: string;
let out: string[];
let err: string[];
const io = { out: (s: string) => out.push(s), err: (s: string) => err.push(s) };
const cli = (...args: string[]) => run([...args, "--baseline", join(dir, "a11y-baseline.json"), "--report", join(dir, "a11y-report/report.json")], io);
const finding = (rule: string) => ({ page: "home", project: "desktop", rule, target: "input", impact: "critical", help: "", helpUrl: "", html: "" });

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "a11y-cli-"));
  out = [];
  err = [];
  mkdirSync(join(dir, "a11y-report"));
  writeFileSync(join(dir, "a11y-report/report.json"), JSON.stringify({
    scans: [{ page: "home", project: "desktop", findings: [finding("label")], fresh: [], known: [], fixed: [], disabled: {}, axeVersion: "4.10.0" }],
  }));
});

describe("a11y-fitness baseline", () => {
  it("init writes the baseline from the report", () => {
    expect(cli("baseline", "init")).toBe(0);
    const b = JSON.parse(readFileSync(join(dir, "a11y-baseline.json"), "utf8"));
    expect(b.entries).toEqual([{ page: "home", project: "desktop", rule: "label", target: "input", count: 1, reason: "" }]);
    expect(out.join("\n")).toContain("Wrote 1 entries for 1 elements");
  });
  it("init refuses to replace a baseline", () => {
    cli("baseline", "init");
    expect(cli("baseline", "init")).toBe(1);
    expect(err.join("\n")).toContain('exists. Use "baseline prune" or "baseline accept".');
  });
  it("init tells the operator to run the tests when there is no report", () => {
    expect(run(["baseline", "init", "--baseline", join(dir, "b.json"), "--report", join(dir, "none.json")], io)).toBe(1);
    expect(err.join("\n")).toContain("Run the Playwright tests first.");
  });
  it("prune removes the fixed entries", () => {
    writeFileSync(join(dir, "a11y-baseline.json"), JSON.stringify({ version: 1, entries: [
      { page: "home", project: "desktop", rule: "label", target: "input", count: 1, reason: "" },
      { page: "home", project: "desktop", rule: "region", target: "div", count: 1, reason: "" },
    ] }));
    expect(cli("baseline", "prune")).toBe(0);
    expect(JSON.parse(readFileSync(join(dir, "a11y-baseline.json"), "utf8")).entries).toHaveLength(1);
    expect(out.join("\n")).toContain("Removed 1 fixed elements");
  });
  it("accept adds an entry with the reason", () => {
    expect(cli("baseline", "accept", "region", "--page", "home", "--project", "desktop", "--target", "div", "--reason", "Vendor widget.")).toBe(0);
    expect(JSON.parse(readFileSync(join(dir, "a11y-baseline.json"), "utf8")).entries[0].reason).toBe("Vendor widget.");
  });
  it("accept needs all options", () => {
    expect(cli("baseline", "accept", "region", "--page", "home")).toBe(1);
    expect(err.join("\n")).toContain("accept needs --page, --project, --target, and --reason.");
  });
  it("check fails growth without a reason", () => {
    const against = join(dir, "base.json");
    writeFileSync(against, JSON.stringify({ version: 1, entries: [] }));
    writeFileSync(join(dir, "a11y-baseline.json"), JSON.stringify({ version: 1, entries: [
      { page: "home", project: "desktop", rule: "label", target: "input", count: 1, reason: "" }] }));
    expect(cli("baseline", "check", "--against", against)).toBe(1);
    expect(err.join("\n")).toContain("without a reason");
  });
  it("check passes and reminds about prune when the report has fixed entries", () => {
    const against = join(dir, "base.json");
    writeFileSync(against, JSON.stringify({ version: 1, entries: [] }));
    writeFileSync(join(dir, "a11y-report/report.json"), JSON.stringify({ scans: [{ page: "home", project: "desktop", findings: [], fresh: [], known: [],
      fixed: [{ page: "home", project: "desktop", rule: "label", target: "input", count: 1, reason: "" }], disabled: {}, axeVersion: "4.10.0" }] }));
    expect(cli("baseline", "check", "--against", against)).toBe(0);
    expect(out.join("\n")).toContain('1 elements in the baseline are fixed. Run "a11y-fitness baseline prune".');
  });
  it("init and prune warn about the problems of the report, and then continue", () => {
    const problems = ["The run used --grep. Some tests did not run.", "A scan attachment is not valid."];
    writeFileSync(join(dir, "a11y-report/report.json"), JSON.stringify({
      scans: [{ page: "home", project: "desktop", findings: [finding("label")], fresh: [], known: [], fixed: [], disabled: {}, axeVersion: "4.10.0" }],
      problems,
    }));
    expect(cli("baseline", "init")).toBe(0);
    expect(err).toEqual(problems.map((p) => `Warning: ${p}`));
    expect(existsSync(join(dir, "a11y-baseline.json"))).toBe(true);
    err.length = 0;
    expect(cli("baseline", "prune")).toBe(0);
    expect(err).toEqual(problems.map((p) => `Warning: ${p}`));
    expect(out.join("\n")).toContain("Removed 0 fixed elements");
  });
  it("init and prune give no warning when the report has no problems", () => {
    expect(cli("baseline", "init")).toBe(0);
    expect(cli("baseline", "prune")).toBe(0);
    expect(err).toEqual([]);
  });
  it("gives the usage for an unknown command", () => {
    expect(run(["nothing"], io)).toBe(1);
    expect(err.join("\n")).toContain("Usage: a11y-fitness baseline init|prune|accept|check");
    expect(existsSync(join(dir, "a11y-baseline.json"))).toBe(false);
  });
});
