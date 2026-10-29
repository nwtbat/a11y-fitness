import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { VERSION } from "./version.js";

describe("VERSION", () => {
  it("is the version in package.json", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    expect(VERSION).toBe(pkg.version);
  });
});
