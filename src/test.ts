import { test as base, expect } from "@playwright/test";
import { compare, readBaseline, type Finding, type ScanRecord } from "./baseline.js";
import { baselinePath, SCAN_ATTACHMENT } from "./constants.js";
import { axeFindings, type ScanOptions } from "./scan.js";

export interface A11y {
  scan(name: string, options?: ScanOptions): Promise<ScanRecord>;
}

const describe = (f: Finding) => `${f.rule} (${f.impact ?? "unknown"}) at ${f.target}: ${f.help}`;

export const test = base.extend<{ a11y: A11y }>({
  a11y: async ({ page }, use, testInfo) => {
    const baseline = readBaseline(baselinePath());
    const project = testInfo.project.name || "default";
    await use({
      async scan(name, options = {}) {
        const { findings, axeVersion } = await axeFindings(page, name, project, options);
        const { fresh, known, fixed } = compare(findings, baseline, name, project);
        const record: ScanRecord = {
          page: name, project, findings, fresh, known, fixed, disabled: options.disableRules ?? {}, axeVersion,
        };
        await testInfo.attach(SCAN_ATTACHMENT, { body: JSON.stringify(record), contentType: "application/json" });
        expect.soft(fresh.map(describe), `New accessibility violations on "${name}" [${project}]`).toEqual([]);
        return record;
      },
    });
  },
});

export { expect };
