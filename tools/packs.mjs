#!/usr/bin/env node
// Dev-only: LevelDB packs <-> JSON source (pack-src/).
//   node tools/packs.mjs unpack [name...]   packs/<name>  -> pack-src/<name>/*.json
//   node tools/packs.mjs build  [name...] [--out DIR]   pack-src/<name> -> DIR/<name> (LevelDB)
// Safety: unpack reads from a temp COPY of packs/<name> (never opens the live DB, which a
// running Foundry may hold locked). build never writes into ./packs; default --out is a temp dir.
import { extractPack, compilePack } from "@foundryvtt/foundryvtt-cli";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LIVE = path.join(ROOT, "packs");
const SRC = path.join(ROOT, "pack-src");

const args = process.argv.slice(2);
const cmd = args.shift();
let out = path.join(os.tmpdir(), "sw25-packs-build");
const oi = args.indexOf("--out");
if (oi >= 0) { out = path.resolve(args[oi + 1]); args.splice(oi, 2); }
const names = (dir) => (args.length ? args : fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => fs.statSync(path.join(dir, n)).isDirectory()) : []);

if (cmd === "unpack") {
  for (const n of names(LIVE)) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `sw25-unpack-${n}-`));
    fs.cpSync(path.join(LIVE, n), tmp, { recursive: true, filter: (s) => !s.endsWith(`${path.sep}LOCK`) });
    const dest = path.join(SRC, n);
    fs.rmSync(dest, { recursive: true, force: true });
    await extractPack(tmp, dest, { log: false, clean: true });
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`unpacked ${n} -> ${path.relative(ROOT, dest)} (${fs.readdirSync(dest).length} files)`);
  }
} else if (cmd === "build") {
  if (path.resolve(out) === LIVE || path.resolve(out).startsWith(LIVE + path.sep))
    throw new Error("Refusing to build into the live packs/ folder. Use a temp --out and let the release owner copy it.");
  for (const n of names(SRC)) {
    const dest = path.join(out, n);
    fs.rmSync(dest, { recursive: true, force: true });
    await compilePack(path.join(SRC, n), dest, { log: false, recursive: true });
    console.log(`built ${n} -> ${dest}`);
  }
} else {
  console.log("usage: node tools/packs.mjs unpack|build [names...] [--out DIR]");
  process.exit(1);
}
