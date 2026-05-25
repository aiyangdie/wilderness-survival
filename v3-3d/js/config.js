export const CFG = {
  worldSize: 160,
  terrainSegments: 28,
  daySeconds: 180,
  entityCullDist: 42,
  entityAiDist: 38,
  spawnInvuln: 4,
  fixedDt: 1 / 60,
  maxCatchUp: 2,
  player: {
    walkSpeed: 7,
    runSpeed: 12,
    jumpForce: 8.5,
    gravity: 24,
    height: 1.75,
    maxHealth: 100,
    attackRange: 3.8,
    attackDamage: 24,
    attackCooldown: 0.4,
    interactRange: 4.2,
    interactDamage: 16,
    catchRange: 3.2,
    catchHpRatio: 0.45,
    coyoteTime: 0.12,
  },
  decay: { hunger: 0.2, thirst: 0.32 },
  spawn: { tree: 52, rock: 24, bush: 28, deer: 7, rabbit: 8, wolf: 3 },
  camera: {
    dist: 6.5,
    height: 2.8,
    sensX: 0.0022,
    sensY: 0.002,
    smooth: 0.18,
  },
  craft: {
    cooked_meat: { meat: 1, wood: 1 },
  },
  ui: {
    barsInterval: 0.1,
    labelsInterval: 0.18,
  },
};

export const ITEMS = {
  wood: { icon: '🪵', name: '木材' },
  stone: { icon: '🪨', name: '石头' },
  fiber: { icon: '🌿', name: '纤维' },
  meat: { icon: '🥩', name: '生肉' },
  cooked_meat: { icon: '🍖', name: '熟肉' },
};

export const ENTITY_LABELS = {
  tree: '树木',
  rock: '岩石',
  bush: '灌木',
  deer: '鹿',
  rabbit: '野兔',
  wolf: '狼',
  shadow: '暗影',
};

export const RESOURCES = {
  tree: { hp: 50, drop: { wood: 3 }, color: 0x2d6a3e, radius: 1.3, verb: '砍伐' },
  rock: { hp: 60, drop: { stone: 2 }, color: 0x6c757d, radius: 1.0, verb: '开采' },
  bush: { hp: 20, drop: { fiber: 2 }, color: 0x40916c, radius: 0.8, verb: '采集', drink: 18 },
};

export const CREATURES = {
  deer: { hp: 40, speed: 6, passive: true, drop: { meat: 2 }, color: 0xa68a64, radius: 1.0 },
  rabbit: { hp: 15, speed: 8, passive: true, drop: { meat: 1 }, color: 0xd4a59a, radius: 0.6 },
  wolf: { hp: 55, speed: 7, damage: 12, aggro: 22, color: 0x495057, radius: 1.0, hostile: true },
  shadow: { hp: 90, speed: 6.5, damage: 20, aggro: 26, color: 0x4a148c, nightOnly: true, radius: 1.1, hostile: true },
};
