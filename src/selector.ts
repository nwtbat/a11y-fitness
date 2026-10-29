/** Normalize an axe node target so that a rebuild of the page gives the same text.
 *  A class or ID is generated, and is removed, when it starts with a build prefix
 *  (css-, sc-, jsx-, svelte-, astro-, emotion-) or holds two or more digits.
 *  An attribute selector is removed when its name is a scoped-CSS hash
 *  (data-astro-cid-*, or data-v- with six or more hex digits). All other attribute selectors stay. */
const HASH_ATTR = /^(?:data-astro-cid-.*|data-v-[0-9a-f]{6,})$/i;
const ATTR_NAME = /^\[\s*(?:[^\s|\]]*\|(?!=))?([^\s~|^$*=\]]+)/;
const PREFIX = /^(?:css|sc|jsx|svelte|astro|emotion)-/i;
const TOKEN = /([.#])((?:\\(?:[0-9a-fA-F]{1,6}\s?|.)|[A-Za-z0-9_-])+)/g;
const COMBINATOR = /(\s*[>+~]\s*|\s+)/;

/** CSS maps a zero, surrogate, or out-of-range code point to U+FFFD. */
function decodeHex(hex: string): string {
  const cp = parseInt(hex, 16);
  return cp === 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff) ? "\ufffd" : String.fromCodePoint(cp);
}

function isGenerated(name: string): boolean {
  const plain = name.replace(/\\([0-9a-fA-F]{1,6})\s?|\\(.)/g, (_m, hex: string | undefined, ch: string | undefined) =>
    hex !== undefined ? decodeHex(hex) : (ch ?? ""));
  return PREFIX.test(plain) || (plain.match(/\d/g) ?? []).length >= 2;
}

function normalizeOne(selector: string, tag?: string): string {
  const brackets: string[] = [];
  let text = selector.replace(/\[[^\]]*\]/g, (match) =>
    HASH_ATTR.test(ATTR_NAME.exec(match)?.[1] ?? "") ? "" : `\u0000${brackets.push(match) - 1}\u0000`);
  // A removed class inside :not() leaves "div:not()": not valid CSS, but the key stays stable.
  text = text.replace(TOKEN, (match, _sigil: string, name: string) => (isGenerated(name) ? "" : match));
  const parts = text.trim().split(COMBINATOR);
  const out: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      out.push(parts[i] !== "" ? parts[i] : i === parts.length - 1 && tag ? tag : "*");
    } else {
      const sep = parts[i].trim();
      out.push(sep === "" ? " " : ` ${sep} `);
    }
  }
  return out.join("").replace(/\u0000(\d+)\u0000/g, (_m, n: string) => brackets[Number(n)]);
}

/** tag: the tag name of the element. It replaces the last compound when that compound becomes empty. */
export function normalizeTarget(target: ReadonlyArray<string | ReadonlyArray<string>>, tag?: string): string {
  const last = target.length - 1;
  return target
    .map((part, i) => (typeof part === "string"
      ? normalizeOne(part, i === last ? tag : undefined)
      : part.map((p, j) => normalizeOne(p, i === last && j === part.length - 1 ? tag : undefined)).join(" >> ")))
    .join(" >>> ");
}
