import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { THEMES, themePref } from "../../app/room/theme";

test("every room theme has a stylesheet block, and the ids are unique", () => {
  const css = readFileSync("app/room/room.css", "utf8");
  assert.equal(new Set(THEMES.map(t => t.id)).size, THEMES.length);
  assert.equal(THEMES[0].id, "wood", "dark wood stays the default");
  for (const theme of THEMES.slice(1)) assert.match(css, new RegExp(`\[data-theme="${theme.id}"\]`), theme.id);
});

test("without browser storage the theme falls back to dark wood", () => {
  assert.equal(themePref.get(), "wood");
  themePref.set("sky");
  assert.equal(themePref.get(), "wood", "nothing persists without storage, and setting does not throw");
});
