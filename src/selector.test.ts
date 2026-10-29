import { describe, expect, it } from "vitest";
import { normalizeTarget } from "./selector.js";

describe("normalizeTarget", () => {
  it("keeps a plain selector", () => {
    expect(normalizeTarget(["button.rate-2"])).toBe("button.rate-2");
  });
  it("removes a class with a build prefix", () => {
    expect(normalizeTarget(["div.css-abc > button"])).toBe("div > button");
  });
  it("removes a class or ID with two or more digits", () => {
    expect(normalizeTarget(["div.x9f3a2 > a"])).toBe("div > a");
  });
  it("replaces a compound that becomes empty with *", () => {
    expect(normalizeTarget(["#shopify-section-template--21474836480__main > .rate"])).toBe("* > .rate");
  });
  it("gives the same result for two Shopify section IDs", () => {
    const a = normalizeTarget(["#shopify-section-template--111111__main .price"]);
    const b = normalizeTarget(["#shopify-section-template--222222__main .price"]);
    expect(a).toBe(b);
  });
  it("does not change the text in an attribute selector", () => {
    expect(normalizeTarget(['[data-id="a1234b5"] > span'])).toBe('[data-id="a1234b5"] > span');
  });
  it("joins frames with >>> and shadow parts with >>", () => {
    expect(normalizeTarget(["iframe#pay", ["my-widget", "button"]])).toBe("iframe#pay >>> my-widget >> button");
  });
  it("normalizes the spaces around combinators", () => {
    expect(normalizeTarget(["ul>li  +  li"])).toBe("ul > li + li");
  });
  it("uses the tag when the selector of the element itself becomes empty", () => {
    expect(normalizeTarget([".css-1x2y3z"], "img")).toBe("img");
  });
  it("uses the tag only for the last compound", () => {
    expect(normalizeTarget(["#shopify-section-template--21474836480__main > .x77y88"], "input")).toBe("* > input");
  });
});
