/**
 * Ability growth rolls are identified and claimed through their ChatMessage.
 * The GM coordinator serializes choice requests before saving a claim.
 */
export function growthChoiceIsSelectable(growth, ability, startingGrowth) {
  if (!growth || growth.status !== "pending" || growth.selected) return false;
  return growth.candidates?.some(
    (candidate) =>
      candidate.ability === ability &&
      Number(candidate.startingGrowth) === Number(startingGrowth)
  ) ?? false;
}

export function submitGrowthChoiceRequest({ activeGMs, request, emit, notify }) {
  const coordinator = Array.from(activeGMs ?? [])
    .filter((user) => user?.isGM && user.active)
    .sort((a, b) => a.id.localeCompare(b.id))[0];

  if (!coordinator) {
    notify("No active GM is available to process this growth choice. No increase was applied.");
    return false;
  }

  emit({ ...request, coordinatorId: coordinator.id });
  return true;
}

/**
 * Build a per-client queue for the elected GM. Claims are persisted before
 * actor updates so a failed or interrupted update cannot reopen the roll.
 */
export function createGrowthChoiceCoordinator({ getMessage, getActor, authorize = () => true }) {
  let queue = Promise.resolve();

  async function process(request) {
    if (!request?.messageId || !request?.rollId || !request?.ability) {
      return { ok: false, reason: "invalid-request" };
    }

    const message = await getMessage(request.messageId);
    const growth = message?.getFlag("sw25", "growth");
    if (!growth || growth.rollId !== request.rollId) {
      return { ok: false, reason: "invalid-roll" };
    }
    if (growth.status !== "pending" || growth.selected) {
      return { ok: false, reason: "already-claimed" };
    }

    const candidate = growth.candidates?.find((entry) => entry.ability === request.ability);
    if (!candidate) return { ok: false, reason: "invalid-choice" };
    if (Number(candidate.startingGrowth) !== Number(request.startingGrowth)) {
      return { ok: false, reason: "stale-choice" };
    }

    const actor = await getActor(growth.actorUuid);
    if (!actor || !(await authorize(request, message, actor))) {
      return { ok: false, reason: "not-authorized" };
    }

    const ability = actor.system?.abilities?.[candidate.ability];
    const currentGrowth = Number(ability?.valuegrowth);
    if (!ability || !Number.isFinite(currentGrowth)) {
      return { ok: false, reason: "invalid-actor-growth" };
    }

    const claimedGrowth = {
      ...growth,
      selected: candidate.ability,
      status: "claimed",
      claimedBy: request.userId,
    };
    try {
      await message.setFlag("sw25", "growth", claimedGrowth);
    } catch (error) {
      console.error("sw25-ce | failed to save growth claim", error);
      return { ok: false, reason: "claim-save-failed" };
    }

    try {
      const updated = await actor.update({
        [`system.abilities.${candidate.ability}.valuegrowth`]:
          currentGrowth + 1,
      });
      if (!updated) throw new Error("Actor update returned no updated document");
    } catch (error) {
      try {
        await message.setFlag("sw25", "growth", {
          ...claimedGrowth,
          status: "failed",
          failure: "actor-update-failed",
        });
      } catch (flagError) {
        console.error("sw25-ce | failed to save growth failure state", flagError);
      }
      console.error("sw25-ce | growth claim saved but actor update failed", error);
      return { ok: false, reason: "actor-update-failed" };
    }

    try {
      await message.setFlag("sw25", "growth", {
        ...claimedGrowth,
        status: "applied",
      });
    } catch (error) {
      // The earlier persisted claim still prevents a second automated award.
      console.error("sw25-ce | growth applied but final state update failed", error);
    }
    return {
      ok: true,
      reason: "applied",
      actorUuid: growth.actorUuid,
      ability: candidate.ability,
      before: currentGrowth,
      after: currentGrowth + 1,
    };
  }

  return function handleGrowthChoice(request) {
    const result = queue.then(() => process(request));
    queue = result.catch(() => undefined);
    return result;
  };
}

function growthStatusText(growth, abilityName) {
  if (growth?.status === "failed") {
    return "The growth choice was saved, but the increase could not be applied. This roll remains claimed; ask the GM to resolve it.";
  }
  if (growth?.status === "claimed") {
    return `Growth choice recorded: ${abilityName ?? growth.selected}. The increase may still be processing; this roll remains claimed.`;
  }
  if (growth?.selected) {
    return `Growth choice recorded: ${abilityName ?? growth.selected}.`;
  }
  return "";
}

export function registerGrowthChoiceChatHandler() {
  Hooks.on("renderChatMessageHTML", (message, htmlEl) => {
    const growth = message.getFlag("sw25", "growth");
    if (!growth?.rollId) return;

    const html = $(htmlEl);
    const buttons = html.find(".increase-ability");
    const status = html.find(".sw25-growth-status");
    buttons.each((_, button) => {
      const ability = button.dataset.ability;
      const startingGrowth = button.dataset.value;
      button.disabled = !growthChoiceIsSelectable(growth, ability, startingGrowth);
    });
    status.text(growthStatusText(growth));

    buttons.off("click.sw25Growth").on("click.sw25Growth", function (event) {
      event.preventDefault();
      const ability = event.currentTarget.dataset.ability;
      const startingGrowth = Number(event.currentTarget.dataset.value);
      if (!growthChoiceIsSelectable(growth, ability, startingGrowth)) return;
      buttons.prop("disabled", true);

      const request = {
        method: "growthChoice",
        requestId: foundry.utils.randomID(),
        userId: game.user.id,
        messageId: message.id,
        rollId: growth.rollId,
        ability,
        startingGrowth,
      };
      const queued = submitGrowthChoiceRequest({
        activeGMs: game.users,
        request,
        emit: (data) => game.socket.emit("system.sw25", data),
        notify: (text) => ui.notifications.error(text),
      });
      if (!queued) {
        buttons.each((_, button) => {
          button.disabled = !growthChoiceIsSelectable(
            growth,
            button.dataset.ability,
            button.dataset.value
          );
        });
      }
    });
  });
}

export function notifyGrowthChoiceResult(data) {
  if (data.userId !== game.user.id) return;
  if (data.ok) {
    ui.notifications.info("Growth ability increase applied.");
    return;
  }

  const messages = {
    "invalid-request": "The growth choice request was invalid.",
    "invalid-roll": "This growth roll could not be found.",
    "already-claimed": "A choice has already been recorded for this growth roll.",
    "invalid-choice": "That ability was not one of the choices for this growth roll.",
    "invalid-actor-growth": "The actor's ability growth data is invalid; no increase was applied.",
    "not-authorized": "You are not authorized to choose growth for this actor.",
    "stale-choice": "The requested ability value did not match this growth roll; no increase was applied.",
    "claim-save-failed": "The growth choice could not be saved, so no increase was applied.",
    "actor-update-failed": "The choice was saved but the ability increase failed. The roll remains claimed; ask the GM to resolve it.",
    "coordinator-failed": "The GM could not process this growth choice. Check the chat card before trying again.",
  };
  ui.notifications.warn(messages[data.reason] ?? "The growth choice was rejected.");
}

export async function growthCheck(actor) {
  const rollMode = globalThis.sw25RollMode();
  const formula = "2d6";
  const chatFormula = "1D6 , 1D6";

  const roll = new Roll(formula);
  await roll.evaluate();

  const roll1 = roll.dice[0].results[0].result;
  const roll2 = roll.dice[0].results[1].result;
  const abilities = ["dex", "agi", "str", "vit", "int", "mnd"];

  const growth1Label = abilities[roll1 - 1];
  const growth1LabelUc = growth1Label.capitalize();
  const growth1 = actor.system.abilities[growth1Label];
  const growth1Name = game.i18n.localize(`SW25.Ability.${growth1LabelUc}.long`);
  const growth1Abbr = game.i18n.localize(`SW25.Ability.${growth1LabelUc}.abbr`);
  const growth1Die = game.i18n.localize(`SW25.Ability.${growth1LabelUc}.die`);
  const growth1after = growth1.value + 1;
  const growth1aftermod = Math.floor(growth1after / 6);
  let upcss1 = "";
  if (growth1.mod < growth1aftermod) upcss1 = "color: #0f6f0f;";

  const growth2Label = abilities[roll2 - 1];
  const growth2LabelUc = growth2Label.capitalize();
  const growth2 = actor.system.abilities[growth2Label];
  const growth2Name = game.i18n.localize(`SW25.Ability.${growth2LabelUc}.long`);
  const growth2Abbr = game.i18n.localize(`SW25.Ability.${growth2LabelUc}.abbr`);
  const growth2Die = game.i18n.localize(`SW25.Ability.${growth2LabelUc}.die`);
  const growth2after = growth2.value + 1;
  const growth2aftermod = Math.floor(growth2after / 6);
  let upcss2 = "";
  if (growth2.mod < growth2aftermod) upcss2 = " color: #0f6f0f;";

  const result = `
        <span style="font-size: 0.8em;">
            <span style="font-size: 0.5em;">${growth1Abbr}:</span>${growth1.value}<span style="font-size: 0.7em;">(+${growth1.mod})</span> > ${growth1after}<span style="font-size: 0.7em;${upcss1}">(+${growth1aftermod})</span> , 
            <span style="font-size: 0.5em;">${growth2Abbr}:</span>${growth2.value}<span style="font-size: 0.7em;">(+${growth2.mod})</span> > ${growth2after}<span style="font-size: 0.7em;;${upcss2}">(+${growth2aftermod})</span>
        </span>
    `;

  let chatContent = await foundry.applications.handlebars.renderTemplate(
    "systems/sw25-ce/templates/roll/roll-check.hbs",
    {
      formula: chatFormula,
      tooltip: await roll.getTooltip(),
      total: result,
    }
  );

  const candidates = [
    { ability: growth1Label, startingGrowth: Number(growth1.valuegrowth) },
    { ability: growth2Label, startingGrowth: Number(growth2.valuegrowth) },
  ];
  chatContent += `
      <div class="flexrow">
        <button class="increase-ability" data-ability="${growth1Label}" data-value="${growth1.valuegrowth}">${growth1Die} : ${growth1Name}</button>
        <button class="increase-ability" data-ability="${growth2Label}" data-value="${growth2.valuegrowth}">${growth2Die} : ${growth2Name}</button>
      </div>
      <div class="sw25-growth-status" aria-live="polite"></div>
    `;

  const growth = {
    rollId: foundry.utils.randomID(),
    actorUuid: actor.uuid,
    candidates,
    selected: null,
    status: "pending",
  };
  const chatData = {
    user: game.user.id,
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: game.i18n.localize("SW25.Ability.Growth"),
    content: chatContent,
    rollMode,
    rolls: [roll],
    flags: {
      sw25: {
        actor: `${actor._id}`,
        growth,
      },
    },
  };

  await ChatMessage.create(chatData);
}
