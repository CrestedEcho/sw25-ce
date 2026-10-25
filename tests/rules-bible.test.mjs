import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { buildRules, mdToHtml, frontMatter } from "../tools/build-compendia.mjs";

test("rules bible: markdown -> HTML", () => {
  assert.deepEqual(frontMatter("---\ntitle: A\npage: 3\n---\nbody").meta, { title: "A", page: "3" });
  const h = mdToHtml("# T\n\npara *it* **b**\n\n- a\n- b\n\n1. x\n\n| h |\n|---|\n| c |\n\n> q", () => null);
  for (const s of ["<h1>T</h1>", "<em>it</em>", "<strong>b</strong>", "<ul><li>a</li><li>b</li></ul>", "<ol><li>x</li></ol>", "<th>h</th>", "<td>c</td>", "<blockquote><p>q</p></blockquote>"]) assert.ok(h.includes(s), s);
  assert.ok(mdToHtml("<script>", () => null).includes("&lt;script&gt;"));
});

test("rules bible: folders by chapter, pages, @UUID links, Observer ownership", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rules-"));
  fs.mkdirSync(path.join(dir, "01-combat")); fs.mkdirSync(path.join(dir, "02-magic"));
  fs.writeFileSync(path.join(dir, "01-combat", "_chapter.md"), "---\ntitle: Combat Rules\n---\n");
  fs.writeFileSync(path.join(dir, "01-combat", "01-alpha.md"), "---\ntitle: Alpha\nsource: Test\npage: 5\n---\nSee [[beta|B]] and [[nope]].\n## Page: Second\nmore");
  fs.writeFileSync(path.join(dir, "02-magic", "01-beta.md"), "---\ntitle: Beta\n---\nhi");
  const { docs, list, broken } = buildRules(dir);
  const folders = docs.filter((d) => d._key.startsWith("!folders!"));
  assert.deepEqual(folders.map((f) => f.name), ["Combat Rules", "Magic"]);
  const a = docs.find((d) => d.name === "Alpha"); const b = docs.find((d) => d.name === "Beta");
  assert.equal(a.folder, folders[0]._id); assert.equal(b.folder, folders[1]._id);
  assert.equal(a.ownership.default, 2); assert.equal(b.ownership.default, 2);
  assert.deepEqual(a.pages.map((p) => p.name), ["Alpha", "Second"]);
  assert.ok(a.pages[0].text.content.includes(`@UUID[Compendium.sw25-ce.sw25-rules.JournalEntry.${b._id}]{B}`));
  assert.ok(a.pages[0].text.content.includes("Source: Test, p. 5"));
  assert.equal(a.pages[1]._key, `!journal.pages!${a._id}.${a.pages[1]._id}`);
  assert.deepEqual(broken, ["01-combat/01-alpha.md: [[nope]]"]);
  assert.deepEqual(list, { "01-combat": ["alpha"], "02-magic": ["beta"] });
  assert.deepEqual(buildRules(dir).docs, docs, "deterministic");
});
