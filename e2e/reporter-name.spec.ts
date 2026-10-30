import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

// Playwright resolves a reporter name with require.resolve from inside its own package, so a
// self-reference from this repo does not work. This test makes a consumer project that holds the
// package in node_modules, and runs Playwright there with the reporter named by its package name.
// The name resolves to dist/, so test:browser builds first.
test("a consumer config can name the reporter by its package name", () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  // A directory outside this repo, so that node_modules lookup does not reach the repo.
  const dir = mkdtempSync(join(tmpdir(), "a11y-consumer-"));
  try {
    mkdirSync(join(dir, "node_modules", "@nwtbat"), { recursive: true });
    symlinkSync(root, join(dir, "node_modules", "@nwtbat", "a11y-fitness"), "dir");
    symlinkSync(join(root, "node_modules", "@playwright"), join(dir, "node_modules", "@playwright"), "dir");
    writeFileSync(join(dir, "playwright.config.mjs"), `export default {
  testDir: ".",
  reporter: [["@nwtbat/a11y-fitness/reporter", { outputDir: "a11y-report" }]],
};
`);
    writeFileSync(join(dir, "empty.spec.mjs"), `import { test } from "@playwright/test";
test("runs", () => {});
`);
    const cli = createRequire(import.meta.url).resolve("@playwright/test/cli");
    const run = spawnSync(process.execPath, [cli, "test", "--config", join(dir, "playwright.config.mjs")], {
      cwd: dir, encoding: "utf8", timeout: 60_000, env: { ...process.env, A11Y_BASELINE: join(dir, "a11y-baseline.json") },
    });
    expect(run.stderr + run.stdout).not.toContain("ERR_PACKAGE_PATH_NOT_EXPORTED");
    expect(run.status, run.stderr + run.stdout).toBe(0);
    expect(existsSync(join(dir, "a11y-report", "report.json"))).toBe(true);
  } finally {
    // rmSync does not follow the symlinks, so the repo stays.
    rmSync(dir, { recursive: true, force: true });
  }
});
