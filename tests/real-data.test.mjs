import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs"; import path from "node:path";
import { planGrants } from "../module/rules/engine.mjs";
import { listData, toDoc, exptableOf, checkRefs, inlineItems } from "../tools/build-compendia.mjs";

const DATA = new URL("../../gen/data/", import.meta.url).pathname;
const cats = ["classes", "feats", "spells", "items", "monsters", "gods"];
const all = cats.flatMap((cat) => listData(path.join(DATA, cat)).map((d) => ({ cat, d })));
const bySlug = (cat) => new Map(all.filter((x) => x.cat === cat).map((x) => [x.d.slug, x.d]));
const priest = bySlug("classes").get("priest");
const gods = bySlug("gods"); const spells = bySlug("spells");

test("Priest god choice lists exactly the 30 gods, all present", () => {
  const ch = priest.autoFeats.find((g) => g.choose === "god");
  assert.equal(gods.size, 30);
  assert.deepEqual([...ch.options].sort(), [...gods.keys()].sort());
});

test("each god's special spells are granted only for that god, at their level, and resolve", () => {
  for (const [id, god] of gods) {
    const at15 = planGrants(priest.autoFeats, 15, { god: id }, []);
    const special = at15.add.map((a) => a.ref).filter((r) => r.startsWith("divine-"));
    assert.ok(special.length > 0, id);
    assert.ok(special.every((r) => r.startsWith(`divine-${id}/`)), `${id} leaks another god's spells`);
    for (const r of special) assert.ok(spells.has(r), `unresolved ${r}`);
    for (const s of god.specialSpells ?? []) {
      const ref = s.ref ?? `divine-${id}/${s.slug}`;
      assert.equal(planGrants(priest.autoFeats, s.level - 1, { god: id }, []).add.some((a) => a.ref === ref), false, `${ref} before level`);
      assert.ok(planGrants(priest.autoFeats, s.level, { god: id }, []).add.some((a) => a.ref === ref), `${ref} at level`);
    }
  }
});

test("switching god removes old special spells and adds new ones", () => {
  const lyphos = planGrants(priest.autoFeats, 5, { god: "lyphos" }, []).want.map((w, i) => ({ id: `i${i}`, ref: w.ref }));
  const p = planGrants(priest.autoFeats, 5, { god: "tidan" }, lyphos);
  const removed = p.remove.map((id) => lyphos.find((g) => g.id === id).ref);
  assert.ok(removed.length && removed.every((r) => r.startsWith("divine-lyphos/")));
  assert.ok(p.add.every((a) => a.ref.startsWith("divine-tidan/")));
});

test("nested spell slugs are unique (vampiric-weapon exists under several gods)", () => {
  const s = all.filter((x) => x.cat === "spells").map((x) => x.d.slug);
  assert.equal(new Set(s).size, s.length);
});

test("exptable: major A, minor B on every class", () => {
  for (const [slug, c] of bySlug("classes")) {
    const t = toDoc("classes", c).system.exptable;
    assert.equal(t, c.category === "major" ? "A" : "B", slug);
    assert.equal(exptableOf({ category: c.category }), t);
  }
});

test("unknown new fields kept verbatim in flags", () => {
  for (const slug of ["dark-hunter", "geomancer", "fairy-tamer", "bard"]) {
    const c = bySlug("classes").get(slug); if (!c) continue;
    assert.deepEqual(toDoc("classes", c).flags["sw25-ce"].data, c);
  }
  assert.ok(bySlug("classes").get("fairy-tamer")?.fairyContract);
});

test("Grappler Throw inline weapon becomes an item; refs report", async () => {
  const inl = inlineItems([...bySlug("classes").values()]);
  const thr = inl.find((x) => x.slug === "throw");
  assert.equal(thr.type, "weapon");
  assert.equal(toDoc("items", thr).type, "weapon");
  const r = await checkRefs([...all, { cat: "items", d: thr }]);
  assert.equal(r.unresolved.filter((u) => String(u.ref).startsWith("divine-")).length, 0);
  assert.equal(r.unresolved.filter((u) => u.ref === "throw").length, 0);
  assert.deepEqual(r.unmappedKeys, {});
});
