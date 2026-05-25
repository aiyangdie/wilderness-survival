import { RECIPES, ITEMS } from './config.js';
import { canCookMeat, cookMeatCosts } from './survival.js';

export class CraftSystem {
  constructor() {
    this.equipment = { weapon: null, armor: null, accessory: null };
  }

  _recipeCosts(recipeId, ctx = {}) {
    if (recipeId === 'cooked_meat') return cookMeatCosts(!!ctx.nearCampfire);
    return RECIPES[recipeId]?.costs || null;
  }

  canCraft(recipeId, inventory, ctx = {}) {
    const r = RECIPES[recipeId];
    if (!r) return false;
    if (recipeId === 'cooked_meat') return canCookMeat(inventory, !!ctx.nearCampfire);
    const costs = r.costs;
    for (const [k, v] of Object.entries(costs)) {
      if ((inventory[k] || 0) < v) return false;
    }
    return true;
  }

  craft(recipeId, inventory, equipmentMgr, ctx = {}) {
    const r = RECIPES[recipeId];
    if (!r) return { ok: false, reason: '未知配方' };

    if (recipeId === 'cooked_meat') {
      if (!canCookMeat(inventory, !!ctx.nearCampfire)) {
        return {
          ok: false,
          reason: ctx.nearCampfire ? '需要生肉' : '需要生肉+木材，或到篝火旁',
        };
      }
      const costs = cookMeatCosts(!!ctx.nearCampfire);
      for (const [k, v] of Object.entries(costs)) {
        inventory[k] -= v;
        if (inventory[k] <= 0) delete inventory[k];
      }
      inventory.cooked_meat = (inventory.cooked_meat || 0) + 1;
      return { ok: true, recipe: r, build: null };
    }

    if (!this.canCraft(recipeId, inventory, ctx)) return { ok: false, reason: '材料不足' };

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
