import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { loadPowerTable, weaponSystem, spellPowerFields, powerRow, powerTableWarnings } from "../tools/build-compendia.mjs";

const FIX = path.join(path.dirname(new URL(import.meta.url).pathname), "fixtures", "fake-power-table.json");
const T = loadPowerTable(FIX); // invented numbers, not book data

test("weapon without its own powerTable gets the row for its power", () => {
  const s = weaponSystem({ slug: "w", power: 7 }, T);
  assert.equal(s.pt3, 21); assert.equal(s.pt10, 28); assert.equal(s.pt12, 30);
});
test("explicit powerTable override wins over the table", () => {
  const s = weaponSystem({ power: 7, powerTable: [1, 1, 1, 1, 1, 1, 1, 1, 1, 9] }, T);
  assert.equal(s.pt3, 1); assert.equal(s.pt12, 9);
});
test("unknown power warns and leaves rows blank; no power (guns) stays blank silently", () => {
  powerTableWarnings.clear();
  assert.equal(weaponSystem({ slug: "odd", power: 99 }, T).pt3, undefined);
  assert.ok([...powerTableWarnings].some((m) => /power 99/.test(m) && /odd/.test(m)));
  powerTableWarnings.clear();
  assert.equal(weaponSystem({ slug: "gun", power: null }, T).pt3, undefined);
  assert.equal(powerTableWarnings.size, 0);
});
test("missing table file is handled: null table, no rows, no throw", () => {
  const none = loadPowerTable("/nonexistent/power-table.json");
  assert.equal(none, null);
  assert.equal(weaponSystem({ power: 7 }, none).pt3, undefined);
  assert.equal(powerRow(7, none), null);
});
test("spells: numeric power gets pt rows; {rate} object without a table gets one; own table kept", () => {
  assert.equal(spellPowerFields({ power: 5 }, T).pt11, 19);
  assert.deepEqual(spellPowerFields({ power: { rate: 5 } }, T).power.table, [11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  const own = [0, 0, 0, 0, 0, 0, 0, 0, 0, 1];
  assert.deepEqual(spellPowerFields({ power: { rate: 5, table: own } }, T).power.table, own);
});
