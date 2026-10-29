import { resolve } from "node:path";

export const WCAG_TAGS: readonly string[] = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
export const SCAN_ATTACHMENT = "a11y-scan";
export const KEYBOARD_ANNOTATION = "a11y-keyboard";
export const baselinePath = (): string => resolve(process.env.A11Y_BASELINE ?? "a11y-baseline.json");
