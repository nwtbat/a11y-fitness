import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/test.ts", "src/reporter.ts", "src/cli.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  target: "node20",
});
