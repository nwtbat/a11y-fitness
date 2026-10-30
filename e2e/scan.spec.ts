import { readFileSync } from "node:fs";
import { expect, test as plain } from "@playwright/test";
import { test } from "../src/test.js";
import { axeFindings, WCAG_TAGS } from "../src/scan.js";
import { compare, initBaseline, keyOf, readBaseline, type ScanRecord } from "../src/baseline.js";

const html = (name: string) => readFileSync(new URL(`./pages/${name}.html`, import.meta.url), "utf8");

plain("axeFindings returns the violations with normalized targets", async ({ page }) => {
  await page.setContent(html("violations"));
  const { findings, axeVersion } = await axeFindings(page, "violations", "chromium");
  expect(axeVersion).toMatch(/^\d+\.\d+/);
  expect(findings.map((f) => `${f.rule} ${f.target}`).sort()).toEqual([
    "image-alt img",
    'label input[type="email"]',
    'label input[type="text"]',
  ]);
});

plain("a changed section ID gives the same findings", async ({ page }) => {
  await page.setContent(html("violations").replace("21474836480", "99999999999"));
  const { findings } = await axeFindings(page, "violations", "chromium");
  const c = compare(findings, readBaseline("e2e/a11y-baseline.json"), "violations", "chromium");
  expect(c.fresh).toEqual([]);
});

plain("generated IDs and classes that change on each load give the same keys", async ({ page }) => {
  const load = async () => {
    await page.setContent(html("generated"));
    const ids = await page.locator("section").evaluateAll((els) => els.map((e) => `${e.id} ${e.className}`));
    const { findings, axeVersion } = await axeFindings(page, "generated", "chromium");
    const record: ScanRecord = {
      page: "generated", project: "chromium", findings, fresh: [], known: [], fixed: [], disabled: {}, axeVersion,
    };
    return { ids, findings, record };
  };
  const first = await load();
  const second = await load();
  for (const ids of [first.ids, second.ids]) {
    expect(ids).toHaveLength(2);
    for (const id of ids) expect(id).toMatch(/^shopify-section-template--\d{11}__main css-[a-z0-9]+$/);
  }
  expect(second.ids.some((id) => first.ids.includes(id))).toBe(false);
  expect(first.findings.map((f) => `${f.rule} ${f.target}`)).toEqual([
    "image-alt * > div > img", "image-alt * > div > img", "label input", "label input",
  ]);
  expect(second.findings.map((f) => f.target)).toEqual(first.findings.map((f) => f.target));
  const baseline = initBaseline([first.record]);
  expect(baseline.entries.map((e) => `${e.rule} ${e.target} ${e.count}`)).toEqual(["image-alt * > div > img 2", "label input 2"]);
  expect(initBaseline([second.record]).entries.map(keyOf)).toEqual(baseline.entries.map(keyOf));
  const c = compare(second.findings, baseline, "generated", "chromium");
  expect(c.fresh).toEqual([]);
  expect(c.known).toHaveLength(4);
  expect(c.fixed).toEqual([]);
});

plain("include limits the scan to a region", async ({ page }) => {
  await page.setContent(html("violations"));
  const { findings } = await axeFindings(page, "form", "chromium", { include: "#form-area" });
  expect(findings.map((f) => f.rule)).toEqual(["label"]);
});

plain("a disabled rule needs a reason", async ({ page }) => {
  await page.setContent(html("violations"));
  await expect(axeFindings(page, "x", "chromium", { disableRules: { label: "" } }))
    .rejects.toThrow('Give a reason to disable the rule "label".');
});

plain("a disabled rule is not reported", async ({ page }) => {
  await page.setContent(html("violations"));
  const { findings } = await axeFindings(page, "x", "chromium", { disableRules: { label: "Covered by a manual test." } });
  expect(findings.map((f) => f.rule)).toEqual(["image-alt"]);
});

plain("the WCAG tags are the tags of the design", () => {
  expect(WCAG_TAGS).toEqual(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]);
});

test("the fixture passes a page whose violations are all in the baseline", async ({ page, a11y }) => {
  await page.setContent(html("violations"));
  const record = await a11y.scan("violations");
  expect(record.known).toHaveLength(3);
  expect(record.fresh).toHaveLength(0);
});

test("the fixture passes a clean page", async ({ page, a11y }) => {
  await page.setContent(html("clean"));
  const record = await a11y.scan("clean");
  expect(record.findings).toEqual([]);
});

test("the fixture fails a page with a new violation", async ({ page, a11y }) => {
  await page.setContent(html("clean").replace('<label for="q">Search</label>', ""));
  const record = await a11y.scan("clean-without-label");
  expect(record.fresh.map((f) => `${f.rule} ${f.target}`)).toEqual(["label #q"]);
  const info = test.info();
  expect(info.errors).toHaveLength(1);
  const message = info.errors[0].message ?? "";
  expect(message).toContain('New accessibility violations on "clean-without-label" [chromium]');
  expect(message).toContain("label (critical) at #q: Form elements must have labels");
  expect(message).toContain(record.fresh[0].helpUrl);
  expect(message).toContain('Fix the violations, or run "a11y-fitness baseline accept <rule> --page clean-without-label'
    + ' --project chromium --target <target> --reason <text>".');
  // The soft failure is the expected result. Remove it so that the test passes.
  info.errors.length = 0;
  info.status = "passed";
});

test("a scan name used two times in a test is an error", async ({ page, a11y }) => {
  await page.setContent(html("clean"));
  await a11y.scan("clean-twice");
  await expect(a11y.scan("clean-twice")).rejects.toThrow(
    'The scan name "clean-twice" is used two times in this test. Each scan name must be unique in a project.');
});
