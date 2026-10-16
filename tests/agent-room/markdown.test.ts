import assert from "node:assert/strict";
import test from "node:test";
import { inlineTokens, parseBlocks } from "../../app/room/markdown-parse";

test("blocks: headings, paragraphs, lists, rules and fenced code", () => {
  const blocks = parseBlocks([
    "## Where they agree", "", "All three agree.", "Second line.", "", "1. **First** point", "   continues here", "2. Second point",
    "- a", "- b", "---", "```json", '{"tasks": []}', "```", "Done.",
  ].join("\n"));
  assert.deepEqual(blocks, [
    { kind: "heading", level: 2, text: "Where they agree" },
    { kind: "para", text: "All three agree.\nSecond line." },
    { kind: "list", ordered: true, items: ["**First** point continues here", "Second point"] },
    { kind: "list", ordered: false, items: ["a", "b"] },
    { kind: "rule" },
    { kind: "code", lang: "json", text: '{"tasks": []}' },
    { kind: "para", text: "Done." },
  ]);
});

test("an unclosed fence keeps the rest as code, and text after an opening fence is code too", () => {
  assert.deepEqual(parseBlocks("Here:\n```json {\"a\": 1}\n{\"b\": 2}"), [
    { kind: "para", text: "Here:" },
    { kind: "code", lang: "json", text: '{"a": 1}\n{"b": 2}' },
  ]);
});

test("inline: code, bold, italic and links; markup inside code stays literal", () => {
  assert.deepEqual(inlineTokens("Run `npm **test**` then **ship** it, *carefully*, see [docs](https://example.com) or [file](file:///D:/x.ts#L1)."), [
    { kind: "text", text: "Run " },
    { kind: "code", text: "npm **test**" },
    { kind: "text", text: " then " },
    { kind: "bold", text: "ship" },
    { kind: "text", text: " it, " },
    { kind: "em", text: "carefully" },
    { kind: "text", text: ", see " },
    { kind: "link", text: "docs", href: "https://example.com" },
    { kind: "text", text: " or " },
    { kind: "link", text: "file", href: "file:///D:/x.ts#L1" },
    { kind: "text", text: "." },
  ]);
  assert.deepEqual(inlineTokens("2 * 3 * 4 and a_b_c"), [{ kind: "text", text: "2 * 3 * 4 and a_b_c" }], "lone asterisks are not italics");
});
