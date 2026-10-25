// node --check every .mjs/.js under module/, tools/, tests/ (excludes node_modules)
import { execFileSync } from "node:child_process";
import fs from "node:fs"; import path from "node:path";
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const files = [];
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
  if (e.name === "node_modules" || e.name.startsWith(".")) continue;
  const p = path.join(d, e.name);
  if (e.isDirectory()) walk(p); else if (/\.(mjs|js)$/.test(e.name)) files.push(p);
} };
for (const d of ["module", "tools", "tests"]) if (fs.existsSync(path.join(root, d))) walk(path.join(root, d));
let bad = 0;
for (const f of files) { try { execFileSync(process.execPath, ["--check", f], { stdio: "pipe" }); } catch (e) { bad++; console.error(`FAIL ${path.relative(root, f)}\n${e.stderr}`); } }
console.log(`${files.length - bad}/${files.length} files OK`);
process.exit(bad ? 1 : 0);
