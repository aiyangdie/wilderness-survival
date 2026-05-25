export const CFG = {
  worldSize: 160,
  terrainSegments: 48,
  daySeconds: 180,
  entityCullDist: 55,
  player: {
    walkSpeed: 7,
    runSpeed: 12,
    jumpForce: 8.5,
    gravity: 24,
    height: 1.75,
    maxHealth: 100,
    attackRange: 3.5,
    attackDamage: 24,
    attackCooldown: 0.42,
    interactRange: 3.8,
  },
  decay: { hunger: 0.22, thirst: 0.35 },
  spawn: { tree: 70, rock: 28, bush: 35, deer: 8, rabbit: 10, wolf: 4 },
};

export const RESOURCES = {
  tree: { hp: 50, drop: { wood: 3 }, color: 0x2d6a3e, radius: 1.3 },
  rock: { hp: 60, drop: { stone: 2 }, color: 0x6c757d, radius: 1.0 },
  bush: { hp: 20, drop: { fiber: 2 }, color: 0x40916c, radius: 0.8 },
};

export const CREATURES = {
  deer: { hp: 40, speed: 6, passive: true, drop: { meat: 2 }, color: 0xa68a64, radius: 1.0 },
  rabbit: { hp: 15, speed: 8, passive: true, drop: { meat: 1 }, color: 0xd4a59a, radius: 0.6 },
  wolf: { hp: 55, speed: 7, damage: 12, aggro: 22, color: 0x495057, radius: 1.0 },
  shadow: { hp: 90, speed: 6.5, damage: 20, aggro: 26, color: 0x4a148c, nightOnly: true, radius: 1.1 },
};
