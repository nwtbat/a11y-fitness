import { defineConfig } from "@playwright/test";

process.env.A11Y_BASELINE ??= "e2e/a11y-baseline.json";

export default defineConfig({
  testDir: "e2e",
  reporter: [["list"], ["./src/reporter.ts", { outputDir: "test-results/a11y-report" }]],
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
