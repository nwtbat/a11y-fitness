import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { expectDialogKeyboard, expectFocusVisible, expectNoFocusTrap, expectTabOrder, KEYBOARD_ANNOTATION } from "../src/keyboard.js";

const hasKeyboardAnnotation = (): boolean => test.info().annotations.some((a) => a.type === KEYBOARD_ANNOTATION);

test.beforeEach(async ({ page }) => {
  await page.setContent(readFileSync(new URL("./pages/keyboard.html", import.meta.url), "utf8"));
});

test("expectTabOrder passes the real order and records an annotation", async ({ page }) => {
  await expectTabOrder(page, [page.locator("#a"), page.locator("#b"), page.locator("#c")]);
  expect(hasKeyboardAnnotation()).toBe(true);
});

test("expectTabOrder fails a wrong order", async ({ page }) => {
  await expect(expectTabOrder(page, [page.locator("#a"), page.locator("#c")])).rejects.toThrow();
});

test("expectTabOrder needs two locators", async ({ page }) => {
  await expect(expectTabOrder(page, [page.locator("#a")])).rejects.toThrow("expectTabOrder needs two or more locators.");
});

test("expectFocusVisible passes an outline", async ({ page }) => {
  await expectFocusVisible(page.locator("#a"));
  expect(hasKeyboardAnnotation()).toBe(true);
});

test("expectFocusVisible passes a box shadow without an outline", async ({ page }) => {
  await expectFocusVisible(page.locator("#shadow"));
});

test("expectFocusVisible passes a change of border width only", async ({ page }) => {
  await expectFocusVisible(page.locator("#border-width"));
});

test("expectFocusVisible fails a removed outline", async ({ page }) => {
  await expect(expectFocusVisible(page.locator("#c"))).rejects.toThrow("has no visible focus indicator");
});

test("expectNoFocusTrap passes a free region", async ({ page }) => {
  await expectNoFocusTrap(page.locator("#free"));
  expect(hasKeyboardAnnotation()).toBe(true);
});

test("expectNoFocusTrap fails a trap", async ({ page }) => {
  await expect(expectNoFocusTrap(page.locator("#trap"))).rejects.toThrow("does not move the focus out of");
});

test("expectDialogKeyboard passes a correct dialog", async ({ page }) => {
  await expectDialogKeyboard(page.locator("#open"), page.locator("#dialog"));
  expect(hasKeyboardAnnotation()).toBe(true);
});

test("expectDialogKeyboard fails a dialog that does not close on Escape", async ({ page }) => {
  await expect(expectDialogKeyboard(page.locator("#open-no-escape"), page.locator("#no-escape")))
    .rejects.toThrow("Escape did not close the dialog.");
});

test("expectDialogKeyboard fails a dialog that does not give the focus back", async ({ page }) => {
  await expect(expectDialogKeyboard(page.locator("#open-no-return"), page.locator("#no-return")))
    .rejects.toThrow("The focus did not go back to the opener.");
});

test("expectDialogKeyboard fails a dialog that does not take the focus", async ({ page }) => {
  await expect(expectDialogKeyboard(page.locator("#open-bad"), page.locator("#bad"))).rejects.toThrow();
});
