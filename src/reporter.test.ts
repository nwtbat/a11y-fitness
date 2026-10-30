import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import A11yReporter from "./reporter.js";

const record = (page: string) => ({ page, project: "desktop", findings: [], fresh: [], known: [], fixed: [], disabled: {}, axeVersion: "4.10.0" });
const testCase = (id: string, title: string) =>
  ({ id, title, titlePath: () => ["", "desktop", "a.spec.ts", title], parent: { project: () => ({ name: "desktop" }) }, annotations: [] }) as any;
const result = (pages: string[], status = "passed", retry = 0, keyboard = true) => ({
  status, retry,
  annotations: keyboard ? [{ type: "a11y-keyboard", description: "Tab order of 2 elements" }] : [],
  attachments: pages.map((p) => ({ name: "a11y-scan", contentType: "application/json", body: Buffer.from(JSON.stringify(record(p))) })),
}) as any;
const config = (shard: { current: number; total: number } | null = null) => ({ shard, grep: /.*/, grepInvert: null }) as any;
const newReporter = () => {
  const outputDir = mkdtempSync(join(tmpdir(), "a11y-report-"));
  return { outputDir, reporter: new A11yReporter({ outputDir }) };
};
const readJson = (dir: string) => JSON.parse(readFileSync(join(dir, "report.json"), "utf8"));

describe("A11yReporter", () => {
  it("keeps only the last try of a test", async () => {
    const { outputDir, reporter } = newReporter();
    reporter.onTestEnd(testCase("t1", "home"), result(["home"], "failed", 0));
    reporter.onTestEnd(testCase("t1", "home"), result(["home"], "passed", 1));
    const end = await reporter.onEnd();
    const json = readJson(outputDir);
    expect(json.scans).toHaveLength(1);
    expect(json.duplicates).toEqual([]);
    expect(end).toBeUndefined();
  });
  it("fails the run when two tests use the same scan name", async () => {
    const { outputDir, reporter } = newReporter();
    reporter.onTestEnd(testCase("t1", "a"), result(["home"]));
    reporter.onTestEnd(testCase("t2", "b"), result(["home"]));
    const end = await reporter.onEnd();
    expect(end).toEqual({ status: "failed" });
    expect(readJson(outputDir).runStatus).toBe("failed");
    expect(readFileSync(join(outputDir, "report.md"), "utf8")).toContain('The scan name "home" \\[desktop\\] is used more than one time.');
  });
  it("records the keyboard checks of a test", async () => {
    const { outputDir, reporter } = newReporter();
    reporter.onTestEnd(testCase("t1", "tabs"), result([]));
    await reporter.onEnd();
    expect(readJson(outputDir).keyboard).toEqual([{ test: "tabs", project: "desktop", checks: ["Tab order of 2 elements"], status: "passed" }]);
  });
  it("records no keyboard row for a test without a keyboard annotation", async () => {
    const { outputDir, reporter } = newReporter();
    reporter.onTestEnd(testCase("t1", "home"), result(["home"], "passed", 0, false));
    await reporter.onEnd();
    expect(readJson(outputDir).keyboard).toEqual([]);
  });
  it("lets a skipped try replace an earlier try", async () => {
    const { outputDir, reporter } = newReporter();
    reporter.onTestEnd(testCase("t1", "home"), result(["home"], "failed", 0));
    reporter.onTestEnd(testCase("t1", "home"), result([], "skipped", 1, false));
    await reporter.onEnd();
    const json = readJson(outputDir);
    expect(json.scans).toEqual([]);
    expect(json.keyboard).toEqual([]);
  });
  it("does not count a repeated test (repeatEach) as a duplicate, and keeps the last repeat", async () => {
    const { outputDir, reporter } = newReporter();
    reporter.onTestEnd(testCase("t1-repeat0", "home"), result(["home"], "failed"));
    reporter.onTestEnd(testCase("t1-repeat1", "home"), result(["home"], "passed"));
    const end = await reporter.onEnd();
    const json = readJson(outputDir);
    expect(end).toBeUndefined();
    expect(json.duplicates).toEqual([]);
    expect(json.scans).toHaveLength(1);
    expect(json.keyboard).toEqual([{ test: "home", project: "desktop", checks: ["Tab order of 2 elements"], status: "passed" }]);
  });
  it("skips a malformed attachment and records a problem", async () => {
    const { outputDir, reporter } = newReporter();
    const bad = result(["home"]);
    bad.attachments.push({ name: "a11y-scan", contentType: "application/json", body: Buffer.from("{not json") });
    reporter.onTestEnd(testCase("t1", "home"), bad);
    await reporter.onEnd();
    const json = readJson(outputDir);
    expect(json.scans).toHaveLength(1);
    expect(json.problems).toEqual(['The test "home" [desktop] has a scan attachment that is not valid JSON. The report does not include it.']);
    expect(readFileSync(join(outputDir, "report.md"), "utf8")).toContain("**Problems:**");
  });
  it("records the run status and the shard", async () => {
    const { outputDir, reporter } = newReporter();
    reporter.onBegin(config({ current: 1, total: 2 }));
    reporter.onTestEnd(testCase("t1", "home"), result(["home"]));
    await reporter.onEnd({ status: "failed" } as any);
    const json = readJson(outputDir);
    expect(json.runStatus).toBe("failed");
    expect(json.shard).toEqual({ current: 1, total: 2 });
    const md = readFileSync(join(outputDir, "report.md"), "utf8");
    expect(md).toContain('The run status is "failed".');
    expect(md).toContain("This report is for shard 1 of 2 only.");
  });
  it("records a grep run as a problem", async () => {
    const { outputDir, reporter } = newReporter();
    reporter.onBegin({ shard: null, grep: /home/, grepInvert: null } as any);
    await reporter.onEnd({ status: "passed" } as any);
    expect(readJson(outputDir).problems).toEqual(["This report is for a filtered run only (grep in the config)."]);
  });
  it("records a filtered run from the command line", async () => {
    const argv = process.argv;
    try {
      process.argv = ["node", "playwright", "test", "--reporter", "list", "-g", "home", "--project=desktop",
        "--grep-invert", "slow", "--last-failed", "--only-changed", "--workers", "2", "e2e/scan.spec.ts:12"];
      const { outputDir, reporter } = newReporter();
      reporter.onBegin(config());
      await reporter.onEnd({ status: "passed" } as any);
      expect(readJson(outputDir).problems).toEqual([
        "This report is for a filtered run only (--grep, --project, --grep-invert, --last-failed, --only-changed, file filter).",
      ]);
    } finally {
      process.argv = argv;
    }
  });
  it("records no filter for a full run from the command line", async () => {
    const argv = process.argv;
    try {
      process.argv = ["node", "playwright", "test", "--reporter", "list", "--workers", "2", "--shard", "1/2", "-u", "all"];
      const { outputDir, reporter } = newReporter();
      reporter.onBegin(config());
      await reporter.onEnd({ status: "passed" } as any);
      expect(readJson(outputDir).problems).toEqual([]);
    } finally {
      process.argv = argv;
    }
  });
  it("gives null for the run status and the shard when Playwright does not give them", async () => {
    const { outputDir, reporter } = newReporter();
    await reporter.onEnd();
    const json = readJson(outputDir);
    expect(json.runStatus).toBeNull();
    expect(json.shard).toBeNull();
  });
  it("removes the old report at the start and leaves no temporary files", async () => {
    const { outputDir, reporter } = newReporter();
    writeFileSync(join(outputDir, "report.md"), "old");
    writeFileSync(join(outputDir, "report.json"), "old");
    reporter.onBegin(config());
    expect(existsSync(join(outputDir, "report.md"))).toBe(false);
    expect(existsSync(join(outputDir, "report.json"))).toBe(false);
    await reporter.onEnd({ status: "passed" } as any);
    expect(readdirSync(outputDir).sort()).toEqual(["report.json", "report.md"]);
  });
});
