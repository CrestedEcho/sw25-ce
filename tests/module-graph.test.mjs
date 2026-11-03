// Regression (ce.21-test): a syntax error in any file of the esmodules import graph
// (e.g. `await` inside a non-async method) makes Foundry drop the whole system script,
// so no sheets register and every document opens in the bare BaseSheet.
// This walks the graph from system.json, syntax-checks each file, and checks that
// every named import exists as an export of its target file.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sys = JSON.parse(readFileSync(resolve(ROOT, "system.json"), "utf8"));

function walk() {
  const seen = new Map();
  const stack = (sys.esmodules ?? []).map((p) => resolve(ROOT, p));
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f)) continue;
    assert.ok(existsSync(f), `missing module ${relative(ROOT, f)}`);
    const src = readFileSync(f, "utf8");
    const imports = [];
    const re = /^\s*import\s+(?:([\s\S]*?)\s+from\s+)?["'](\.{1,2}\/[^"']+)["']/gm;
    let m;
    while ((m = re.exec(src))) {
      const target = resolve(dirname(f), m[2]);
      imports.push({ clause: m[1] ?? "", target });
      stack.push(target);
    }
    seen.set(f, { src, imports });
  }
  return seen;
}

function exportsOf(src) {
  const names = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s+let\s+([^;]+);/g)) for (const n of m[1].split(",")) names.add(n.trim().split(/[\s=]/)[0]);
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) for (const part of m[1].split(",")) { const p = part.trim(); if (p) names.add(p.split(/\s+as\s+/).pop().trim()); }
  if (/export\s+default\b/.test(src)) names.add("default");
  return names;
}

const graph = walk();

test("esmodules graph: every file parses (node --check)", () => {
  assert.ok(graph.size > 10, "graph should include the system's modules");
  for (const f of graph.keys()) {
    try { execFileSync(process.execPath, ["--check", f], { stdio: "pipe" }); }
    catch (e) { assert.fail(`syntax error in ${relative(ROOT, f)}:\n${String(e.stderr).split("\n").slice(0, 6).join("\n")}`); }
  }
});

test("esmodules graph: every named import is exported by its target", () => {
  for (const [f, { imports }] of graph) {
    for (const { clause, target } of imports) {
      const named = clause.match(/\{([^}]*)\}/);
      if (!named) continue;
      const ex = exportsOf(graph.get(target).src);
      for (const part of named[1].split(",")) {
        const name = part.trim().split(/\s+as\s+/)[0].trim();
        if (!name) continue;
        assert.ok(ex.has(name), `${relative(ROOT, f)} imports { ${name} } but ${relative(ROOT, target)} does not export it`);
      }
    }
  }
});

test("actor sheet data builder is async (it awaits enrichHTML for the race card)", () => {
  const src = readFileSync(resolve(ROOT, "module/sheets/actor-sheet.mjs"), "utf8");
  assert.match(src, /async\s+_sw25GetData\s*\(/);
});
