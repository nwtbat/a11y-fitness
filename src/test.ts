import { test as base, expect } from "@playwright/test";
import { compare, readBaseline, type Finding, type ScanRecord } from "./baseline.js";
import { baselinePath, SCAN_ATTACHMENT } from "./constants.js";
import { axeFindings, type ScanOptions } from "./scan.js";

export interface A11y {
  scan(name: string, options?: ScanOptions): Promise<ScanRecord>;
}

const describe = (f: Finding) => `${f.rule} (${f.impact ?? "unknown"}) at ${f.target}: ${f.help} (${f.helpUrl})`;

export const test = base.extend<{ a11y: A11y }>({
  a11y: async ({ page }, use, testInfo) => {
    const baseline = readBaseline(baselinePath());
    const project = testInfo.project.name || "default";
    const names = new Set<string>();
    await use({
      async scan(name, options = {}) {
        if (names.has(name)) {
          throw new Error(`The scan name "${name}" is used two times in this test. Each scan name must be unique in a project.`);
        }
        names.add(name);
        const { findings, axeVersion } = await axeFindings(page, name, project, options);
        const { fresh, known, fixed } = compare(findings, baseline, name, project);
        const record: ScanRecord = {
          page: name, project, findings, fresh, known, fixed, disabled: options.disableRules ?? {}, axeVersion,
        };
        await testInfo.attach(SCAN_ATTACHMENT, { body: JSON.stringify(record), contentType: "application/json" });
        expect.soft(fresh.map(describe), `New accessibility violations on "${name}" [${project}]. `
          + `Fix the violations, or run "a11y-fitness baseline accept <rule> --page ${name} --project ${project}`
          + ` --target <target> --reason <text>".`).toEqual([]);
        return record;
      },
    });
  },
});

export { expect };
