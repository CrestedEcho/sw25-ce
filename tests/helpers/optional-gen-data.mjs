import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dataRoot = path.resolve(repository, "../gen/data");
export const hasGeneratedData = existsSync(path.join(dataRoot, "classes/fencer.json"));

export function testWithGeneratedData(name, fn) {
  return test(name, {
    skip: !hasGeneratedData && "requires optional local gen/data fixtures",
  }, fn);
}
