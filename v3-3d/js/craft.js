import { RECIPES, ITEMS } from './config.js';

export class CraftSystem {
  constructor() {
    this.equipment = { weapon: null, armor: null, accessory: null };
  }

  canCraft(recipeId, inventory) {
    const r = RECIPES[recipeId];
    if (!r) return false;
    for (const [k, v] of Object.entries(r.costs)) {
      if ((inventory[k] || 0) < v) return false;
    }
    return true;
  }

  craft(recipeId, inventory, equipmentMgr) {
    const r = RECIPES[recipeId];
    if (!r || !this.canCraft(recipeId, inventory)) return { ok: false, reason: '材料不足' };

    for (const [k, v] of Object.entries(r.costs)) {
      inventory[k] -= v;
      if (inventory[k] <= 0) delete inventory[k];
    }

    const yieldItems = r.yield || {};
    for (const [k, v] of Object.entries(yieldItems)) {
      inventory[k] = (inventory[k] || 0) + v;
    }

    if (r.equip && equipmentMgr) {
      const itemId = Object.keys(yieldItems)[0] || recipeId;
      if (ITEMS[itemId]?.slot) {
        equipmentMgr.equip(itemId);
        this.equipment[r.equip] = itemId;
      }
    }

    return { ok: true, recipe: r, build: r.build || null };
  }

  getRecipeList() {
    return Object.entries(RECIPES).map(([id, r]) => ({ id, ...r }));
  }
}
