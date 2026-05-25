import { CFG, RECIPES, ITEMS, BUILD_DEFS } from './config.js';

/** 生存规则与提示 — 吃喝建造恢复 */
export const SURVIVAL_GUIDE = [
  { title: '口渴 💧', lines: ['找灌木丛按 E 喝水', '口渴归零会持续扣生命'] },
  { title: '饥饿 🍖', lines: ['狩猎 → 生肉', '篝火旁按 C 或 B 制作烤肉', 'E 食用熟肉回饱食+生命', '生肉可吃但有风险'] },
  { title: '生命 ❤️', lines: ['熟肉、棚屋休息回血', '皮甲减伤', '饥饿/口渴过低会扣血'] },
  { title: '体力 ⚡', lines: ['Shift 奔跑消耗', '停止移动快速恢复', '体力过低无法冲刺'] },
  { title: '建造 🏠', lines: ['B 打开制作', '选篝火/木墙/棚屋等 → 左键放置', 'R 旋转 · Esc 取消（退还材料）', '棚屋内按住 E 休息', '篝火旁可烤肉'] },
  { title: '成长路线', lines: ['砍树采石 → 石斧', '猎鹿兔 → 肉 → 篝火', '木板绳索 → 棚屋+围墙', '夜晚躲棚屋、用墙挡怪'] },
];

export function getStatusHint(player, inventory, ctx) {
  const p = player;
  const lines = [];
  if (p.thirst < 35) lines.push('口渴：找灌木按 E 喝水');
  else if (p.hunger < 35) {
    if ((inventory.meat || 0) > 0 && ctx.nearCampfire) lines.push('饥饿：按 C 在篝火烤肉');
    else if ((inventory.cooked_meat || 0) > 0) lines.push('饥饿：按 E 食用熟肉');
    else if ((inventory.meat || 0) > 0) lines.push('饥饿：先做篝火再烤肉');
    else lines.push('饥饿：狩猎动物获取生肉');
  } else if (p.health < 40) {
    if (ctx.nearShelter) lines.push('生命：在棚屋旁按住 E 休息');
    else if ((inventory.cooked_meat || 0) > 0) lines.push('生命：按 E 吃熟肉');
    else lines.push('生命：建造棚屋或吃熟肉');
  } else if (p.stamina < 25) lines.push('体力不足：停止奔跑恢复');
  else if (ctx.nearShelter) lines.push('棚屋：按住 E 休息恢复');
  else if (ctx.nearCampfire) lines.push('篝火：按 C 烤肉（需生肉）');
  else if (
    !ctx.hasCampfire &&
    (inventory.wood || 0) >= (RECIPES.campfire?.costs?.wood || 5) &&
    (inventory.stone || 0) >= (RECIPES.campfire?.costs?.stone || 2)
  ) {
    lines.push('建议：B 制作篝火（需木材+石头）');
  } else if (!ctx.hasCampfire && (inventory.wood || 0) >= 3) {
    lines.push('建议：开采岩石获取石头，再建篝火');
  }
  return lines[0] || '采集资源 · 狩猎 · B 制作 · 建造基地';
}

export function findNearBuilding(placed, px, pz, type, range) {
  for (const b of placed) {
    if (b.type !== type || b.hp <= 0) continue;
    const r = (b.def?.radius || 1) + range;
    const dx = b.x - px;
    const dz = b.z - pz;
    if (dx * dx + dz * dz <= r * r) return b;
  }
  return null;
}

export function canCookMeat(inventory, nearCampfire) {
  if ((inventory.meat || 0) < 1) return false;
  if (nearCampfire) return true;
  return (inventory.wood || 0) >= (RECIPES.cooked_meat.costs.wood || 1);
}

export function cookMeatCosts(nearCampfire) {
  if (nearCampfire) return { meat: 1 };
  return { ...RECIPES.cooked_meat.costs };
}

export function applyEat(itemId, player) {
  const S = CFG.survival?.eat || {};
  if (itemId === 'cooked_meat') {
    player.hunger = Math.min(100, player.hunger + (S.cookedHunger ?? 45));
    player.health = Math.min(100, player.health + (S.cookedHealth ?? 15));
    player.thirst = Math.min(100, player.thirst + (S.cookedThirst ?? 5));
    return { ok: true, msg: '食用熟肉 — 饱食与生命恢复' };
  }
  if (itemId === 'meat') {
    player.hunger = Math.min(100, player.hunger + (S.rawHunger ?? 22));
    player.health = Math.max(0, player.health - (S.rawHealthPenalty ?? 6));
    return { ok: true, msg: '食用生肉（有病菌风险，建议烤肉）' };
  }
  if (itemId === 'fiber') {
    player.hunger = Math.min(100, player.hunger + (S.fiberHunger ?? 8));
    return { ok: true, msg: '咀嚼纤维充饥（效果有限）' };
  }
  return { ok: false, msg: '无法食用' };
}

export function applyDrink(player, amount) {
  player.thirst = Math.min(100, player.thirst + amount);
}

export function applyShelterRest(player, dt) {
  const S = CFG.survival?.shelter || {};
  player.health = Math.min(100, player.health + (S.healthPerSec ?? 3) * dt);
  player.hunger = Math.min(100, player.hunger + (S.hungerPerSec ?? 1.2) * dt);
  player.thirst = Math.min(100, player.thirst + (S.thirstPerSec ?? 0.8) * dt);
  player.stamina = Math.min(100, player.stamina + (S.staminaPerSec ?? 4) * dt);
}

export function refundRecipe(recipeId, inventory) {
  const r = RECIPES[recipeId];
  if (!r?.costs) return;
  for (const [k, v] of Object.entries(r.costs)) {
    inventory[k] = (inventory[k] || 0) + v;
  }
}

export function getBuildCosts(recipeId) {
  return RECIPES[recipeId]?.costs || null;
}
