import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderMarkdown, type Report } from "./report.js";

const finding = { page: "home", project: "desktop", rule: "label", target: "input|x", impact: "critical", help: "Form elements must have labels", helpUrl: "https://dequeuniversity.com/rules/axe/4.10/label", html: "<input>" };
const report: Report = {
  date: "2026-10-19", packageVersion: "0.1.0", axeVersion: "4.10.0",
  scans: [{ page: "home", project: "desktop", findings: [finding], fresh: [finding], known: [], fixed: [], disabled: { "color-contrast": "Covered by contrast.spec.ts." }, axeVersion: "4.10.0" }],
  keyboard: [{ test: "buy dialog", project: "desktop", checks: ["Dialog keyboard for #buy"], status: "passed" }],
  baseline: { version: 1, entries: [{ page: "home", project: "desktop", rule: "region", target: "div", count: 2, reason: "Vendor widget." }] },
  duplicates: [], problems: [], runStatus: "passed", shard: null,
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

const odd = { ...finding, rule: "listitem", target: ".sm\\:hidden", help: "<li> elements must be contained in a <ul> or <ol>" };
const special: Report = {
  ...report,
  scans: [
    { ...report.scans[0], page: "b", findings: [odd], fresh: [odd], disabled: { region: "Uses *stars* and _under_ [x] `code` & more." } },
    { ...report.scans[0], page: "a", project: "mobile" },
    { ...report.scans[0], page: "a", project: "desktop", fresh: [{ ...finding, page: "a", rule: "z" }, { ...finding, page: "a", rule: "a" }] },
  ],
  keyboard: [
    { test: "z", project: "desktop", checks: ["c"], status: "passed" },
    { test: "a", project: "desktop", checks: ["c"], status: "passed" },
  ],
};

describe("renderMarkdown escaping", () => {
  const md = renderMarkdown(special);
  it("escapes HTML in the help text", () => {
    expect(md).toContain("&lt;li&gt; elements must be contained in a &lt;ul&gt; or &lt;ol&gt;");
    expect(md).not.toContain("<li>");
  });
  it("escapes a backslash in a target", () => {
    expect(md).toContain(".sm\\\\:hidden");
  });
  it("escapes Markdown characters in a reason", () => {
    expect(md).toContain("Uses \\*stars\\* and \\_under\\_ \\[x\\] \\`code\\` &amp; more.");
  });
});

describe("renderMarkdown order", () => {
  const md = renderMarkdown(special);
  it("sorts the scans by page, then by project", () => {
    const a = md.indexOf("| a | desktop | 2 |"), m = md.indexOf("| a | mobile |"), b = md.indexOf("| b | desktop |");
    expect(a).toBeGreaterThan(-1);
    expect(a).toBeLessThan(m);
    expect(m).toBeLessThan(b);
  });
  it("sorts the findings in a group by rule", () => {
    expect(md.indexOf("| a | desktop | a | critical |")).toBeLessThan(md.indexOf("| a | desktop | z | critical |"));
  });
  it("sorts the keyboard rows", () => {
    expect(md.indexOf("| a | desktop | c | passed |")).toBeLessThan(md.indexOf("| z | desktop | c | passed |"));
  });
});

describe("renderMarkdown problems", () => {
  it("has no problems line for a full run that passed", () => {
    expect(renderMarkdown(report)).not.toContain("**Problems:**");
  });
  it("names a run that did not pass, a shard, duplicates, and other problems", () => {
    const md = renderMarkdown({ ...report, runStatus: "failed", shard: { current: 2, total: 3 }, duplicates: ["Dup."], problems: ["Bad."] });
    const line = md.split("\n").find((l) => l.startsWith("**Problems:**"));
    expect(line).toContain('The run status is "failed".');
    expect(line).toContain("This report is for shard 2 of 3 only.");
    expect(line).toContain("Dup.");
    expect(line).toContain("Bad.");
  });
});

const pandoc = ["pandoc", join(homedir(), ".local/share/sow/pandoc")].find((p) => {
  try { execFileSync(p, ["--version"], { stdio: "ignore" }); return true; } catch { return false; }
});

describe.skipIf(!pandoc)("renderMarkdown with pandoc", () => {
  it("keeps every table row and makes no raw HTML", () => {
    const md = renderMarkdown(special);
    const json = execFileSync(pandoc!, ["-f", "markdown", "-t", "json"], { input: md }).toString("utf8");
    expect(json).not.toMatch(/"RawBlock"|"RawInline"/);
    const doc = JSON.parse(json);
    const tables = doc.blocks.filter((b: { t: string }) => b.t === "Table");
    // pandoc >= 2.10: [attr, caption, colspecs, head, bodies, foot]. Older pandoc: [caption, aligns, widths, head, rows].
    const bodyRows = (tb: any) => tb.c.length === 6
      ? tb.c[4].reduce((n: number, body: any) => n + body[2].length + body[3].length, 0)
      : tb.c[4].length;
    const mdTables = md.split("\n\n").filter((s) => s.startsWith("| "));
    expect(tables).toHaveLength(mdTables.length);
    tables.forEach((tb: unknown, i: number) => expect(bodyRows(tb)).toBe(mdTables[i].trim().split("\n").length - 2));
  });
});
