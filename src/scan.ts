import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import type { Finding } from "./baseline.js";
import { WCAG_TAGS } from "./constants.js";
import { normalizeTarget } from "./selector.js";

export { WCAG_TAGS };

export interface ScanOptions {
  include?: string | string[];
  exclude?: string | string[];
  disableRules?: Record<string, string>;
}

const list = (value?: string | string[]) => (value === undefined ? [] : Array.isArray(value) ? value : [value]);

export async function axeFindings(page: Page, name: string, project: string, options: ScanOptions = {}):
  Promise<{ findings: Finding[]; axeVersion: string }> {
  const disabled = options.disableRules ?? {};
  for (const [rule, reason] of Object.entries(disabled)) {
    if (!reason.trim()) throw new Error(`Give a reason to disable the rule "${rule}".`);
  }
  let builder = new AxeBuilder({ page }).withTags([...WCAG_TAGS]);
  for (const selector of list(options.include)) builder = builder.include(selector);
  for (const selector of list(options.exclude)) builder = builder.exclude(selector);
  if (Object.keys(disabled).length) builder = builder.disableRules(Object.keys(disabled));
  const results = await builder.analyze();
  const findings: Finding[] = [];
  for (const violation of results.violations) {
    for (const node of violation.nodes) {
      findings.push({
        page: name, project, rule: violation.id,
        target: normalizeTarget(node.target as unknown as ReadonlyArray<string | ReadonlyArray<string>>,
          /^<([a-z][a-z0-9-]*)/i.exec(node.html)?.[1]?.toLowerCase()),
        impact: violation.impact ?? null, help: violation.help, helpUrl: violation.helpUrl,
        html: node.html.slice(0, 200),
      });
    }
  }
  return { findings, axeVersion: results.testEngine.version };
}
