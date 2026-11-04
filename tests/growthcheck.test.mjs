import test from "node:test";
import assert from "node:assert/strict";
import {
  createGrowthChoiceCoordinator,
  growthChoiceIsSelectable,
  submitGrowthChoiceRequest,
} from "../module/helpers/growthcheck.mjs";

function makeHarness({ failActorUpdate = false } = {}) {
  const record = {
    rollId: "roll-1",
    actorUuid: "Actor.actor-1",
    candidates: [
      { ability: "dex", startingGrowth: 2 },
      { ability: "agi", startingGrowth: 4 },
    ],
    selected: null,
    status: "pending",
  };
  const actor = {
    system: { abilities: { dex: { valuegrowth: 2 }, agi: { valuegrowth: 4 } } },
    async update(changes) {
      if (failActorUpdate) throw new Error("simulated actor update failure");
      const [path, value] = Object.entries(changes)[0];
      const ability = path.split(".")[2];
      this.system.abilities[ability].valuegrowth = value;
      return this;
    },
  };
  const message = {
    author: { id: "user-1" },
    getFlag: (scope, key) => (scope === "sw25" && key === "growth" ? record : undefined),
    async setFlag(scope, key, value) {
      assert.equal(scope, "sw25");
      assert.equal(key, "growth");
      Object.assign(record, value);
      return this;
    },
  };
  const handle = createGrowthChoiceCoordinator({
    getMessage: async (id) => (id === "message-1" ? message : null),
    getActor: async (uuid) => (uuid === record.actorUuid ? actor : null),
    authorize: () => true,
  });
  const request = (ability, startingGrowth, rollId = "roll-1") => ({
    messageId: "message-1",
    rollId,
    ability,
    startingGrowth,
    userId: "user-1",
  });
  return { record, actor, message, handle, request };
}

test("a persisted claim stays disabled when the same card is rendered again", () => {
  let growth = {
    rollId: "roll-1",
    candidates: [{ ability: "dex", startingGrowth: 2 }, { ability: "agi", startingGrowth: 4 }],
    selected: null,
    status: "pending",
  };
  const message = {
    getFlag: () => growth,
    setFlag: (value) => { growth = value; },
  };

  assert.equal(growthChoiceIsSelectable(message.getFlag(), "dex", 2), true);
  message.setFlag({ ...growth, selected: "dex", status: "applied" });

  // A later render reads the persisted message state and disables both choices.
  assert.equal(growthChoiceIsSelectable(message.getFlag(), "dex", 2), false);
  assert.equal(growthChoiceIsSelectable(message.getFlag(), "agi", 4), false);
});

test("separate growth rolls maintain independent claim states", async () => {
  const first = makeHarness();
  const second = makeHarness();
  second.record.rollId = "roll-2";
  second.record.actorUuid = "Actor.actor-1";
  const messages = new Map([
    ["message-1", first.message],
    ["message-2", second.message],
  ]);
  const actors = new Map([
    ["Actor.actor-1", first.actor],
  ]);
  const handle = createGrowthChoiceCoordinator({
    getMessage: async (id) => messages.get(id),
    getActor: async (uuid) => actors.get(uuid),
    authorize: () => true,
  });

  const firstResult = await handle({ ...first.request("dex", 2), messageId: "message-1" });
  const secondResult = await handle({ ...second.request("dex", 2, "roll-2"), messageId: "message-2" });

  assert.equal(firstResult.ok, true);
  assert.equal(secondResult.ok, true);
  assert.equal(first.record.selected, "dex");
  assert.equal(second.record.selected, "dex");
  assert.equal(first.actor.system.abilities.dex.valuegrowth, 4);
});

test("invalid and stale ability requests are rejected without an increase", async () => {
  const invalid = makeHarness();
  const invalidResult = await invalid.handle(invalid.request("str", 0));
  assert.equal(invalidResult.reason, "invalid-choice");
  assert.equal(invalid.record.selected, null);
  assert.equal(invalid.actor.system.abilities.dex.valuegrowth, 2);

  const stale = makeHarness();
  stale.actor.system.abilities.dex.valuegrowth = 3;
  const staleResult = await stale.handle(stale.request("dex", 3));
  assert.equal(staleResult.reason, "stale-choice");
  assert.equal(stale.record.status, "pending");
  assert.equal(stale.record.selected, null);
  assert.equal(stale.actor.system.abilities.dex.valuegrowth, 3);
});

test("competing requests are serialized and only the first valid choice succeeds", async () => {
  const { handle, request, record, actor } = makeHarness();
  const results = await Promise.all([
    handle(request("dex", 2)),
    handle(request("agi", 4)),
  ]);

  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.equal(record.status, "applied");
  assert.ok(["dex", "agi"].includes(record.selected));
  assert.equal(actor.system.abilities.dex.valuegrowth + actor.system.abilities.agi.valuegrowth, 7);
});

test("actor update failure leaves the saved claim locked and visible as failed", async () => {
  const { handle, request, record, actor } = makeHarness({ failActorUpdate: true });
  const result = await handle(request("dex", 2));

  assert.equal(result.reason, "actor-update-failed");
  assert.equal(record.selected, "dex");
  assert.equal(record.status, "failed");
  assert.equal(record.failure, "actor-update-failed");
  assert.equal(actor.system.abilities.dex.valuegrowth, 2);
  assert.equal((await handle(request("agi", 4))).reason, "already-claimed");
});

test("a choice request fails safely when no active GM coordinator exists", () => {
  let emitted = false;
  let notice = "";
  const sent = submitGrowthChoiceRequest({
    activeGMs: [{ id: "gm-offline", isGM: true, active: false }],
    request: { method: "growthChoice" },
    emit: () => { emitted = true; },
    notify: (message) => { notice = message; },
  });

  assert.equal(sent, false);
  assert.equal(emitted, false);
  assert.match(notice, /No active GM/);
});
