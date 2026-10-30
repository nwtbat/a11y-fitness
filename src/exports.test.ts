import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Playwright resolves a reporter name with require.resolve. The package resolves itself by name.
const require = createRequire(import.meta.url);

describe("package exports", () => {
  it.each([
    ["@nwtbat/a11y-fitness", "dist/index.js"],
    ["@nwtbat/a11y-fitness/test", "dist/test.js"],
    ["@nwtbat/a11y-fitness/reporter", "dist/reporter.js"],
  ])("require.resolve finds %s", (name, file) => {
    expect(require.resolve(name)).toBe(fileURLToPath(new URL(`../${file}`, import.meta.url)));
  });
});
