import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import A11yReporter from "./reporter.js";

const record = (page: string) => ({ page, project: "desktop", findings: [], fresh: [], known: [], fixed: [], disabled: {}, axeVersion: "4.10.0" });
const testCase = (id: string, title: string) => ({ id, title, parent: { project: () => ({ name: "desktop" }) }, annotations: [] }) as any;
const result = (pages: string[], status = "passed", retry = 0) => ({
  status, retry,
  annotations: [{ type: "a11y-keyboard", description: "Tab order of 2 elements" }],
  attachments: pages.map((p) => ({ name: "a11y-scan", contentType: "application/json", body: Buffer.from(JSON.stringify(record(p))) })),
}) as any;

describe("A11yReporter", () => {
  it("keeps only the last try of a test", async () => {
    const outputDir = mkdtempSync(join(tmpdir(), "a11y-report-"));
    const reporter = new A11yReporter({ outputDir });
    reporter.onTestEnd(testCase("t1", "home"), result(["home"], "failed", 0));
    reporter.onTestEnd(testCase("t1", "home"), result(["home"], "passed", 1));
    const end = await reporter.onEnd();
    const json = JSON.parse(readFileSync(join(outputDir, "report.json"), "utf8"));
    expect(json.scans).toHaveLength(1);
    expect(json.duplicates).toEqual([]);
    expect(end).toBeUndefined();
  });
  it("fails the run when two tests use the same scan name", async () => {
    const outputDir = mkdtempSync(join(tmpdir(), "a11y-report-"));
    const reporter = new A11yReporter({ outputDir });
    reporter.onTestEnd(testCase("t1", "a"), result(["home"]));
    reporter.onTestEnd(testCase("t2", "b"), result(["home"]));
    const end = await reporter.onEnd();
    expect(end).toEqual({ status: "failed" });
    expect(readFileSync(join(outputDir, "report.md"), "utf8")).toContain('The scan name "home" [desktop] is used more than one time.');
  });
  it("records the keyboard checks of a test", async () => {
    const outputDir = mkdtempSync(join(tmpdir(), "a11y-report-"));
    const reporter = new A11yReporter({ outputDir });
    reporter.onTestEnd(testCase("t1", "tabs"), result([]));
    await reporter.onEnd();
    const json = JSON.parse(readFileSync(join(outputDir, "report.json"), "utf8"));
    expect(json.keyboard).toEqual([{ test: "tabs", project: "desktop", checks: ["Tab order of 2 elements"], status: "passed" }]);
  });
});
