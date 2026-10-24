import assert from "node:assert/strict";
import test from "node:test";
import { fileTree, formatBytes } from "../../app/room/files-view";

test("flat git paths become a tree with folders first, each sorted by name", () => {
  const tree = fileTree(["src/b.js", "README.md", "src/lib/a.js", "src/a.js", ".gitignore"]);
  assert.deepEqual(tree.map(n => n.name), ["src", ".gitignore", "README.md"]);
  const src = tree[0];
  assert.equal(src.path, "src");
  assert.deepEqual(src.children!.map(n => [n.name, n.path]), [["lib", "src/lib"], ["a.js", "src/a.js"], ["b.js", "src/b.js"]]);
  assert.deepEqual(src.children![0].children!.map(n => n.path), ["src/lib/a.js"]);
  assert.deepEqual(fileTree([]), []);
});

test("sizes read as bytes, KB or MB", () => {
  assert.equal(formatBytes(19), "19 B");
  assert.equal(formatBytes(2048), "2.0 KB");
  assert.equal(formatBytes(3 * 1024 * 1024), "3.0 MB");
});
