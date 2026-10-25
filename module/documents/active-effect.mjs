import { normalizeChanges, prepareEffectData } from "../rules/effect-changes.mjs";
/**
 * Extend the base Actor document by defining a custom roll data structure which is ideal for the Simple system.
 * @extends {ActiveEffect}
 */
export class SW25ActiveEffect extends ActiveEffect {
  /** @override */
  prepareData() {
    // Prepare data for the active effect.
    super.prepareData();
  }

  /** @override */
  prepareDerivedData() {
    super.prepareDerivedData();
    // preparation methods overridden (such as prepareBaseData()).
    const effectData = this;
  }

  /** @override */
  async update(data = {}, options = {}) {
    return super.update(prepareEffectData(data), options);
  }

  /** @override */
  static async create(data, options = {}) {
    return super.create(prepareEffectData(data), options);
  }

  static applyChangeData(changes) {
    return normalizeChanges(changes);
  }
}
