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
  it.each(["sc-abc", "jsx-abc", "svelte-abc", "astro-abc", "emotion-abc", "EMOTION-q"])(
    "removes a class with the build prefix of %s",
    (name) => {
      expect(normalizeTarget([`div.${name} > button`])).toBe("div > button");
    },
  );
  it("reads a CSS hex escape and its trailing space as one character", () => {
    expect(normalizeTarget(["#\\31 23 > a"])).toBe("* > a");
  });
  it("uses the tag when a hex-escaped ID is the whole last compound", () => {
    expect(normalizeTarget(["#\\31 23"], "div")).toBe("div");
  });
  it("keeps ~ and + combinators with :nth-child stable", () => {
    expect(normalizeTarget(["ul>li:nth-child(2)~li+li"])).toBe("ul > li:nth-child(2) ~ li + li");
  });
  it("removes an escaped Tailwind class with two digits", () => {
    expect(normalizeTarget(["div > .md\\:w-1\\/2"])).toBe("div > *");
  });
  it("writes * for an empty last compound when there is no tag", () => {
    expect(normalizeTarget(["div > .css-abc"])).toBe("div > *");
  });
  it("leaves an empty :not() when its class is removed", () => {
    expect(normalizeTarget(["div:not(.css-abc)"])).toBe("div:not()");
  });
  it("does not throw on an out-of-range hex escape", () => {
    expect(normalizeTarget(["#\\ffffff a"])).toBe("#\\ffffff a");
  });
  it("removes an Astro scoped-CSS attribute and keeps the tag", () => {
    expect(normalizeTarget(["a[data-astro-cid-klcuvl6h]"])).toBe("a");
  });
  it("writes * for a compound that holds only an Astro attribute", () => {
    expect(normalizeTarget(["[data-astro-cid-klcuvl6h] > span"])).toBe("* > span");
  });
  it("uses the tag when the last compound holds only an Astro attribute", () => {
    expect(normalizeTarget(["nav > [data-astro-cid-klcuvl6h]"], "a")).toBe("nav > a");
  });
  it("removes a Vue scoped-CSS attribute, also with a value and in upper case", () => {
    expect(normalizeTarget(['div[data-v-7ba5bd90] > button[DATA-V-7BA5BD90=""].go'])).toBe("div > button.go");
  });
  it("gives the same result for two Vue hashes", () => {
    expect(normalizeTarget(["li[data-v-1a2b3c4d]"])).toBe(normalizeTarget(["li[data-v-9f8e7d6c]"]));
  });
  it("keeps data-v- attributes that are not a hash", () => {
    expect(normalizeTarget(["div[data-v-app] > p[data-v-abc]"])).toBe("div[data-v-app] > p[data-v-abc]");
  });
  it("keeps data-section-id with digits", () => {
    expect(normalizeTarget(['section[data-section-id="1234567"] > a'])).toBe('section[data-section-id="1234567"] > a');
  });
  it("keeps a descendant compound when its only attribute is removed and uses the tag", () => {
    expect(normalizeTarget(["nav [data-astro-cid-x]"], "a")).toBe("nav a");
  });
  it("writes * for a first compound that holds only a removed attribute before a space", () => {
    expect(normalizeTarget(["[data-astro-cid-x] span"])).toBe("* span");
  });
  it("keeps a descendant compound when its only class is removed", () => {
    expect(normalizeTarget(["nav .sc-abc12"])).toBe("nav *");
    expect(normalizeTarget(["nav .sc-abc12"], "a")).toBe("nav a");
  });
  it("leaves an empty :not() when its scoped-CSS attribute is removed", () => {
    expect(normalizeTarget(["a:not([data-v-1a2b3c4d])"])).toBe("a:not()");
  });
});
