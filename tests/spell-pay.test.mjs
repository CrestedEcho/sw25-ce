import { test } from "node:test";
import assert from "node:assert/strict";
import * as P from "../module/rules/spell-pay.mjs";

const stone = (id, value, max = value, extra = {}) => ({ id, name: `Mako ${max}`, type: "consumable", system: { isMako: true, makoPoints: { value, max }, quantity: 1, ...extra } });

test("makoInfo / usableStones: only Mako consumables with points", () => {
  const items = [stone("a", 5), stone("b", 0, 3), { id: "c", type: "consumable", system: { isMako: false } }, stone("d", 3, 3, { makoDaily: true })];
  const u = P.usableStones(items);
  assert.deepEqual(u.map((s) => s.id).sort(), ["a", "d"]);
  assert.equal(P.makoInfo(items[3]).daily, true);
});

test("makoLimit: 1 by default, raised only by rule data", () => {
  assert.equal(P.makoLimit([]), 1);
  assert.equal(P.makoLimit([{ kind: "spell", target: "spell.makoStoneLimit", value: 2, source: "Mako Stones Master" }]), 2);
  assert.equal(P.makoLimit([{ kind: "spell", target: "spell.other", value: 5 }]), 1);
});

test("finalCost: base x targets x meta + surcharge + adjust, never below 0", () => {
  assert.equal(P.finalCost({ base: 3, targets: 2, meta: 1 }), 6);
  assert.equal(P.finalCost({ base: 3, meta: 2, surcharge: 1, adjust: -1 }), 6);
  assert.equal(P.finalCost({ base: 2, adjust: -9 }), 0);
});

test("payPlan: stone pays first, MP covers the rest", () => {
  const p = P.payPlan({ cost: 6, mp: 24, mpMax: 30, stones: [{ id: "a", name: "Mako Stone", value: 5 }] });
  assert.equal(p.fromStones, 5); assert.equal(p.fromMP, 1); assert.equal(p.mpAfter, 23); assert.equal(p.short, false);
  assert.match(P.mpLine(p), /MP paid: 6/); assert.match(P.mpLine(p), /24 → 23/);
});

test("payPlan: one stone per cast unless the limit is raised", () => {
  const stones = [{ id: "a", name: "A", value: 3 }, { id: "b", name: "B", value: 3 }];
  assert.equal(P.payPlan({ cost: 6, mp: 0, mpMax: 10, stones }).stones.length, 1);
  assert.equal(P.payPlan({ cost: 6, mp: 0, mpMax: 10, stones, limit: 2 }).fromStones, 6);
});

test("payPlan: short on MP still allowed, flagged", () => {
  const p = P.payPlan({ cost: 10, mp: 4, mpMax: 20 });
  assert.equal(p.short, true); assert.equal(p.unpaid, 6); assert.equal(p.mpAfter, 0);
  assert.ok(P.shortLine(p));
});

test("payPlan: Spend MP unticked spends nothing", () => {
  const p = P.payPlan({ cost: 5, mp: 10, mpMax: 10, spendMP: false });
  assert.equal(p.nothing, true); assert.equal(p.fromMP, 0); assert.match(P.mpLine(p), /No MP spent/);
});

test("payPlan: no MP pool (Grassrunner) pays with stones only", () => {
  const p = P.payPlan({ cost: 3, mp: 0, mpMax: 0, spendMP: true, stones: [{ id: "a", name: "A", value: 5 }] });
  assert.equal(p.noMP, true); assert.equal(p.fromStones, 3); assert.equal(p.fromMP, 0); assert.equal(p.short, false);
});

test("stoneAfterPay: keeps leftovers, stack refills, daily stays, single is used up", () => {
  assert.deepEqual(P.stoneAfterPay(stone("a", 5), 2), { delete: false, update: { "system.makoPoints.value": 3 } });
  const stack = P.stoneAfterPay(stone("a", 5, 5, { quantity: 3 }), 5);
  assert.equal(stack.update["system.quantity"], 2); assert.equal(stack.update["system.makoPoints.value"], 5);
  assert.deepEqual(P.stoneAfterPay(stone("d", 3, 3, { makoDaily: true }), 3), { delete: false, update: { "system.makoPoints.value": 0 } });
  assert.equal(P.stoneAfterPay(stone("a", 5), 5).delete, true);
});
