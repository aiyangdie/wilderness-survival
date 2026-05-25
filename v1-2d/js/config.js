/** 游戏全局配置 */
export const CONFIG = {
  canvas: { width: 960, height: 540 },
  tile: 32,
  world: { width: 80, height: 60 },

  dayLength: 120, // 秒 = 1 游戏日
  phases: {
    dawn: 0.15,
    day: 0.55,
    dusk: 0.15,
    night: 0.15,
  },

  player: {
    speed: 140,
    sprintMult: 1.65,
    maxHealth: 100,
    maxHunger: 100,
    maxThirst: 100,
    maxStamina: 100,
    attackRange: 42,
    attackDamage: 18,
    attackCooldown: 0.45,
  },

  decay: {
    hungerPerSec: 0.35,
    thirstPerSec: 0.5,
    hungerSprint: 0.25,
    staminaRegen: 22,
    staminaSprintCost: 35,
  },

  spawn: {
    trees: 180,
    rocks: 45,
    bushes: 60,
    deer: 12,
    rabbit: 18,
    wolf: 6,
    shadow: 0, // 夜晚生成
  },
};

export const ITEMS = {
  wood: { id: 'wood', name: '木材', icon: '🪵', stack: 99 },
  stone: { id: 'stone', name: '石头', icon: '🪨', stack: 99 },
  fiber: { id: 'fiber', name: '纤维', icon: '🌿', stack: 99 },
  meat: { id: 'meat', name: '生肉', icon: '🥩', stack: 20 },
  cooked_meat: { id: 'cooked_meat', name: '熟肉', icon: '🍖', stack: 20 },
  leather: { id: 'leather', name: '皮革', icon: '🧵', stack: 20 },
  axe: { id: 'axe', name: '石斧', icon: '🪓', stack: 1, tool: true },
  spear: { id: 'spear', name: '长矛', icon: '🔱', stack: 1, tool: true },
  campfire_kit: { id: 'campfire_kit', name: '篝火套件', icon: '📦', stack: 10 },
  wall_kit: { id: 'wall_kit', name: '木墙套件', icon: '📦', stack: 10 },
  shelter_kit: { id: 'shelter_kit', name: '庇护所套件', icon: '📦', stack: 5 },
};

export const RECIPES = [
  { id: 'axe', name: '石斧', output: { axe: 1 }, cost: { wood: 5, stone: 3 } },
  { id: 'spear', name: '长矛', output: { spear: 1 }, cost: { wood: 4, stone: 2, fiber: 2 } },
  { id: 'cooked_meat', name: '烤肉', output: { cooked_meat: 1 }, cost: { meat: 1 } },
  { id: 'campfire', name: '篝火套件', output: { campfire_kit: 1 }, cost: { wood: 8, stone: 4 } },
  { id: 'wall', name: '木墙套件', output: { wall_kit: 1 }, cost: { wood: 6 } },
  { id: 'shelter', name: '庇护所套件', output: { shelter_kit: 1 }, cost: { wood: 20, stone: 8, fiber: 5 } },
];

export const BUILDINGS = {
  campfire: { id: 'campfire', name: '篝火', icon: '🔥', size: 1, kit: 'campfire_kit', healAura: 2 },
  wall: { id: 'wall', name: '木墙', icon: '🧱', size: 1, kit: 'wall_kit', blocks: true },
  shelter: { id: 'shelter', name: '庇护所', icon: '🏠', size: 2, kit: 'shelter_kit', safeZone: true },
};

export const ENTITY_TYPES = {
  tree: { hp: 40, drop: { wood: 3 }, color: '#2d6a3e', icon: '🌲' },
  rock: { hp: 55, drop: { stone: 2 }, color: '#5c6370', icon: '🪨' },
  bush: { hp: 15, drop: { fiber: 2 }, color: '#40916c', icon: '🌿' },
  deer: { hp: 35, speed: 90, passive: true, drop: { meat: 2, leather: 1 }, color: '#a68a64', icon: '🦌' },
  rabbit: { hp: 12, speed: 130, passive: true, drop: { meat: 1 }, color: '#c9ada7', icon: '🐇' },
  wolf: { hp: 50, speed: 110, damage: 12, aggro: 180, color: '#6c757d', icon: '🐺' },
  shadow: { hp: 80, speed: 85, damage: 22, aggro: 220, color: '#3d0066', icon: '👾', nightOnly: true },
};
