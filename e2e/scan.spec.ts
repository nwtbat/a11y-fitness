import { readFileSync } from "node:fs";
import { expect, test as plain } from "@playwright/test";
import { test } from "../src/test.js";
import { axeFindings, WCAG_TAGS } from "../src/scan.js";
import { compare, readBaseline } from "../src/baseline.js";

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
  test.fail();
  await page.setContent(html("clean").replace('<label for="q">Search</label>', ""));
  await a11y.scan("clean-without-label");
});
