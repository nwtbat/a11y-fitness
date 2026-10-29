import { describe, expect, it } from "vitest";
import { renderMarkdown, type Report } from "./report.js";

const finding = { page: "home", project: "desktop", rule: "label", target: "input|x", impact: "critical", help: "Form elements must have labels", helpUrl: "https://dequeuniversity.com/rules/axe/4.10/label", html: "<input>" };
const report: Report = {
  date: "2026-10-19", packageVersion: "0.1.0", axeVersion: "4.10.0",
  scans: [{ page: "home", project: "desktop", findings: [finding], fresh: [finding], known: [], fixed: [], disabled: { "color-contrast": "Covered by contrast.spec.ts." }, axeVersion: "4.10.0" }],
  keyboard: [{ test: "buy dialog", project: "desktop", checks: ["Dialog keyboard for #buy"], status: "passed" }],
  baseline: { version: 1, entries: [{ page: "home", project: "desktop", rule: "region", target: "div", count: 2, reason: "Vendor widget." }] },
  duplicates: [],
};

describe("renderMarkdown", () => {
  const md = renderMarkdown(report);
  it("starts with the title and the standard", () => {
    expect(md.startsWith("# Accessibility report\n")).toBe(true);
    expect(md).toContain("WCAG 2.2 level A and AA");
  });
  it("has one summary row for each scan", () => {
    expect(md).toContain("| home | desktop | 1 | 0 | 0 |");
  });
  it("escapes a vertical bar in a cell", () => {
    expect(md).toContain("input\\|x");
  });
  it("lists the keyboard tests", () => {
    expect(md).toContain("| buy dialog | desktop | Dialog keyboard for #buy | passed |");
  });
  it("gives the baseline size and the accepted entries", () => {
    expect(md).toContain("The baseline has 1 entries for 2 elements.");
    expect(md).toContain("| home | desktop | region | div | Vendor widget. |");
  });
  it("lists the disabled rules with the reason", () => {
    expect(md).toContain("| home | desktop | color-contrast | Covered by contrast.spec.ts. |");
  });
  it('writes "None." for an empty section', () => {
    expect(md).toContain("## Fixed\n\nNone.\n");
  });
});
