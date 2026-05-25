export const CFG = {
  worldSize: 200,
  daySeconds: 150,
  player: {
    walkSpeed: 6,
    runSpeed: 11,
    jumpForce: 9,
    gravity: 22,
    maxHealth: 100,
    attackRange: 3.2,
    attackDamage: 22,
  },
  decay: { hunger: 0.28, thirst: 0.42 },
};

export const RESOURCES = {
  tree: { hp: 50, drop: { wood: 3 }, color: 0x2d6a3e },
  rock: { hp: 60, drop: { stone: 2 }, color: 0x6c757d },
  bush: { hp: 20, drop: { fiber: 2 }, color: 0x40916c },
};

export const CREATURES = {
  deer: { hp: 40, speed: 7, passive: true, drop: { meat: 2 }, color: 0xa68a64 },
  rabbit: { hp: 15, speed: 9, passive: true, drop: { meat: 1 }, color: 0xd4a59a },
  wolf: { hp: 55, speed: 8, damage: 14, aggro: 25, color: 0x495057 },
  shadow: { hp: 90, speed: 7, damage: 26, aggro: 30, color: 0x4a148c, nightOnly: true },
};
