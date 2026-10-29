import { expect, test, type Locator, type Page } from "@playwright/test";
import { KEYBOARD_ANNOTATION } from "./constants.js";

export { KEYBOARD_ANNOTATION };

const FOCUSABLE = [
  "a[href]", "button:not([disabled])", "input:not([disabled]):not([type=hidden])", "select:not([disabled])",
  "textarea:not([disabled])", '[tabindex]:not([tabindex="-1"])', '[contenteditable="true"]',
].join(", ");

function note(what: string): void {
  test.info().annotations.push({ type: KEYBOARD_ANNOTATION, description: what });
}

export async function expectTabOrder(page: Page, locators: Locator[]): Promise<void> {
  if (locators.length < 2) throw new Error("expectTabOrder needs two or more locators.");
  note(`Tab order of ${locators.length} elements`);
  await locators[0].focus();
  await expect(locators[0]).toBeFocused();
  for (let i = 1; i < locators.length; i++) {
    await page.keyboard.press("Tab");
    await expect(locators[i], `Tab stop ${i + 1} of ${locators.length}`).toBeFocused();
  }
}

type FocusStyle = Record<"outline" | "boxShadow" | "border" | "backgroundColor" | "textDecoration", string>;

const focusStyle = (locator: Locator): Promise<FocusStyle> =>
  locator.evaluate((el) => {
    const s = getComputedStyle(el);
    const noOutline = s.outlineStyle === "none" || s.outlineWidth === "0px";
    return {
      outline: noOutline ? "none" : `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`,
      boxShadow: s.boxShadow,
      // Width, style, and color of all four sides, so that a change of only one of them counts.
      border: (["Top", "Right", "Bottom", "Left"] as const)
        .map((side) => `${s[`border${side}Width`]} ${s[`border${side}Style`]} ${s[`border${side}Color`]}`).join(", "),
      backgroundColor: s.backgroundColor,
      textDecoration: s.textDecorationLine,
    };
  });

export async function expectFocusVisible(locator: Locator): Promise<void> {
  note(`Visible focus on ${locator}`);
  const page = locator.page();
  await locator.evaluate((el) => (el as HTMLElement).blur());
  const before = await focusStyle(locator);
  // A key press first, so that the browser treats the next focus as keyboard focus (:focus-visible).
  await page.keyboard.press("Shift");
  await locator.focus();
  await expect(locator).toBeFocused();
  const after = await focusStyle(locator);
  const changed = (Object.keys(after) as (keyof FocusStyle)[]).some((k) => after[k] !== before[k]);
  expect(changed, `${locator} has no visible focus indicator`).toBe(true);
}

export async function expectNoFocusTrap(region: Locator): Promise<void> {
  note(`No focus trap in ${region}`);
  const page = region.page();
  const items = region.locator(FOCUSABLE);
  const count = await items.count();
  if (count === 0) throw new Error(`${region} has no focusable element.`);
  for (const [key, start] of [["Tab", items.last()], ["Shift+Tab", items.first()]] as const) {
    await start.focus();
    let left = false;
    for (let i = 0; i <= count && !left; i++) {
      await page.keyboard.press(key);
      left = await region.evaluate((r) => !r.contains(document.activeElement));
    }
    expect(left, `${key} does not move the focus out of ${region}`).toBe(true);
  }
}

export async function expectDialogKeyboard(opener: Locator, dialog: Locator): Promise<void> {
  note(`Dialog keyboard for ${dialog}`);
  const page = opener.page();
  await opener.focus();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  await expect.poll(() => dialog.evaluate((d) => d.contains(document.activeElement)),
    { message: "The focus did not move into the dialog." }).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog, "Escape did not close the dialog.").toBeHidden();
  await expect(opener, "The focus did not go back to the opener.").toBeFocused();
}
