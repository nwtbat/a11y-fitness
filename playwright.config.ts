import { existsSync } from "node:fs";
import { defineConfig, type ReporterDescription } from "@playwright/test";

process.env.A11Y_BASELINE ??= "e2e/a11y-baseline.json";

// Task 5 adds src/reporter.ts. Playwright resolves the config reporters even with --reporter.
// TODO(Task 5): remove the existsSync guard.
const a11yReporter: ReporterDescription[] = existsSync("src/reporter.ts")
  ? [["./src/reporter.ts", { outputDir: "test-results/a11y-report" }]]
  : [];

export default defineConfig({
  testDir: "e2e",
  reporter: [["list"], ...a11yReporter],
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
