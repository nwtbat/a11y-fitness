import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  acceptEntry, BaselineError, checkGrowth, compare, emptyBaseline, initBaseline,
  pruneBaseline, readBaseline, writeBaseline, type Baseline, type Finding, type ScanRecord,
} from "./baseline.js";

const f = (rule: string, target = "button", page = "home", project = "desktop"): Finding => ({
  page, project, rule, target, impact: "serious", help: `${rule} help`, helpUrl: "https://example.com", html: "<button>",
});
const entry = (rule: string, count = 1, page = "home", project = "desktop", reason = "") =>
  ({ page, project, rule, target: "button", count, reason });
const scan = (page: string, project: string, findings: Finding[]): ScanRecord =>
  ({ page, project, findings, fresh: [], known: [], fixed: [], disabled: {}, axeVersion: "4.10.0" });
const base = (...entries: ReturnType<typeof entry>[]): Baseline => ({ version: 1, entries });
const tmp = () => mkdtempSync(join(tmpdir(), "a11y-"));

describe("readBaseline", () => {
  it("gives an empty baseline when the file does not exist", () => {
    expect(readBaseline(join(tmp(), "a11y-baseline.json"))).toEqual(emptyBaseline());
  });
  it("names the file when the JSON is not valid", () => {
    const path = join(tmp(), "a11y-baseline.json");
    writeFileSync(path, "{ not json");
    expect(() => readBaseline(path)).toThrow(BaselineError);
    expect(() => readBaseline(path)).toThrow(`${path} is not a valid baseline`);
  });
  it("names the file when an entry has no count", () => {
    const path = join(tmp(), "a11y-baseline.json");
    writeFileSync(path, JSON.stringify({ version: 1, entries: [{ page: "a", project: "b", rule: "c", target: "d", reason: "" }] }));
    expect(() => readBaseline(path)).toThrow(`${path} is not a valid baseline: entry 1 has no count.`);
  });
});

describe("readBaseline rejects bad content", () => {
  const write = (content: unknown) => {
    const path = join(tmp(), "a11y-baseline.json");
    writeFileSync(path, typeof content === "string" ? content : JSON.stringify(content));
    return path;
  };
  const good = { page: "a", project: "b", rule: "c", target: "d", count: 1, reason: "" };
  it.each(["null", "[]"])("names the file when the JSON is %s", (text) => {
    const path = write(text);
    expect(() => readBaseline(path)).toThrow(BaselineError);
    expect(() => readBaseline(path)).toThrow(`${path} is not a valid baseline: `);
  });
  it("rejects a version that is not 1", () => {
    const path = write({ version: 2, entries: [] });
    expect(() => readBaseline(path)).toThrow(`${path} is not a valid baseline: "version" is not 1.`);
  });
  it("rejects an entry that repeats an earlier entry", () => {
    const path = write({ version: 1, entries: [good, { ...good, count: 2 }] });
    expect(() => readBaseline(path)).toThrow(`${path} is not a valid baseline: entry 2 repeats an earlier entry.`);
  });
  it.each([0, -1, 1.5])("rejects the count %s", (count) => {
    const path = write({ version: 1, entries: [{ ...good, count }] });
    expect(() => readBaseline(path)).toThrow(`${path} is not a valid baseline: entry 1 has no count.`);
  });
  it("rejects a field with the wrong type", () => {
    const path = write({ version: 1, entries: [{ ...good, rule: 5 }] });
    expect(() => readBaseline(path)).toThrow(`${path} is not a valid baseline: entry 1 has no rule.`);
  });
  it("rejects an entry that is a string", () => {
    const path = write({ version: 1, entries: ["x"] });
    expect(() => readBaseline(path)).toThrow(`${path} is not a valid baseline: entry 1 has no page.`);
  });
});

describe("writeBaseline", () => {
  it("sorts the entries and ends the file with a newline", () => {
    const path = join(tmp(), "a11y-baseline.json");
    writeBaseline(path, base(entry("b-rule"), entry("a-rule")));
    const text = readFileSync(path, "utf8");
    expect(text.endsWith("}\n")).toBe(true);
    expect(JSON.parse(text).entries.map((e: { rule: string }) => e.rule)).toEqual(["a-rule", "b-rule"]);
  });
});

describe("compare", () => {
  it("marks a finding that is not in the baseline as fresh", () => {
    expect(compare([f("label")], emptyBaseline(), "home", "desktop").fresh).toHaveLength(1);
  });
  it("marks a finding in the baseline as known", () => {
    const c = compare([f("label")], base(entry("label")), "home", "desktop");
    expect(c.known).toHaveLength(1);
    expect(c.fresh).toHaveLength(0);
  });
  it("marks the findings above the baseline count as fresh", () => {
    const c = compare([f("label"), f("label"), f("label")], base(entry("label", 2)), "home", "desktop");
    expect(c.known).toHaveLength(2);
    expect(c.fresh).toHaveLength(1);
  });
  it("reports a baseline entry without a finding as fixed", () => {
    const c = compare([], base(entry("label", 2)), "home", "desktop");
    expect(c.fixed).toEqual([entry("label", 2)]);
  });
  it("reports the part of a count that is gone as fixed", () => {
    const c = compare([f("label")], base(entry("label", 3)), "home", "desktop");
    expect(c.fixed).toEqual([entry("label", 2)]);
  });
  it("ignores the entries of other pages and projects", () => {
    const c = compare([], base(entry("label", 1, "other"), entry("label", 1, "home", "phone")), "home", "desktop");
    expect(c.fixed).toEqual([]);
  });
});

describe("initBaseline", () => {
  it("counts the findings of each key, with an empty reason", () => {
    const b = initBaseline([scan("home", "desktop", [f("label"), f("label"), f("color-contrast")])]);
    expect(b.entries).toEqual([
      { page: "home", project: "desktop", rule: "color-contrast", target: "button", count: 1, reason: "" },
      { page: "home", project: "desktop", rule: "label", target: "button", count: 2, reason: "" },
    ]);
  });
});

describe("pruneBaseline", () => {
  it("lowers each count to the number of findings, and removes zero counts", () => {
    const b = pruneBaseline(base(entry("label", 3), entry("color-contrast", 1)), [scan("home", "desktop", [f("label")])]);
    expect(b.entries).toEqual([entry("label", 1)]);
  });
  it("keeps the entries of a page and project that the run did not scan", () => {
    const kept = entry("label", 1, "checkout", "phone");
    const b = pruneBaseline(base(kept), [scan("home", "desktop", [])]);
    expect(b.entries).toEqual([kept]);
  });
  it("keeps the entries of a project that the run did not scan, on a page that it scanned", () => {
    const kept = entry("label", 1, "home", "phone");
    const b = pruneBaseline(base(kept), [scan("home", "desktop", [])]);
    expect(b.entries).toEqual([kept]);
  });
  it("never adds an entry", () => {
    const b = pruneBaseline(emptyBaseline(), [scan("home", "desktop", [f("label")])]);
    expect(b.entries).toEqual([]);
  });
});

describe("acceptEntry", () => {
  it("adds an entry with the reason", () => {
    const b = acceptEntry(emptyBaseline(), { page: "home", project: "desktop", rule: "label", target: "button", reason: "Vendor widget." });
    expect(b.entries).toEqual([entry("label", 1, "home", "desktop", "Vendor widget.")]);
  });
  it("adds one to the count of an entry that exists", () => {
    const b = acceptEntry(base(entry("label", 1)), { page: "home", project: "desktop", rule: "label", target: "button", reason: "Second widget." });
    expect(b.entries).toEqual([entry("label", 2, "home", "desktop", "Second widget.")]);
  });
  it("refuses an empty reason", () => {
    expect(() => acceptEntry(emptyBaseline(), { page: "home", project: "desktop", rule: "label", target: "button", reason: "  " }))
      .toThrow("Give a reason with --reason.");
  });
});

describe("checkGrowth", () => {
  it("accepts a baseline that did not grow", () => {
    expect(checkGrowth(base(entry("label", 2)), base(entry("label", 1)))).toEqual([]);
  });
  it("accepts growth that has a reason", () => {
    expect(checkGrowth(emptyBaseline(), base(entry("label", 1, "home", "desktop", "Vendor widget.")))).toEqual([]);
  });
  it("reports growth without a reason", () => {
    expect(checkGrowth(base(entry("label", 1)), base(entry("label", 2)))).toEqual([
      'home [desktop] label at button: the baseline grew from 1 to 2 without a reason. Use "a11y-fitness baseline accept".',
    ]);
  });
});
