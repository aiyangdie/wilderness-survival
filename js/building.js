import { BUILDINGS, CONFIG } from './config.js';

export function canPlaceBuilding(world, type, x, y) {
  const def = BUILDINGS[type];
  if (!def) return false;
  const ts = CONFIG.tile;
  const size = def.size * ts;
  const tx = Math.floor(x / ts);
  const ty = Math.floor(y / ts);

  for (let dy = 0; dy < def.size; dy++) {
    for (let dx = 0; dx < def.size; dx++) {
      const cx = tx + dx;
      const cy = ty + dy;
      if (world.tiles[cy * world.width + cx] !== 1) return false;
      if (world.isBlocked(cx * ts + ts / 2, cy * ts + ts / 2, 4)) return false;
    }
  }
  return true;
}

export function placeBuilding(world, type, x, y) {
  const def = BUILDINGS[type];
  if (!def || !canPlaceBuilding(world, type, x, y)) return null;

  const ts = CONFIG.tile;
  const tx = Math.floor(x / ts) * ts;
  const ty = Math.floor(y / ts) * ts;

  const building = {
    id: crypto.randomUUID(),
    type,
    x: tx,
    y: ty,
    size: def.size,
    blocks: !!def.blocks,
    safeZone: !!def.safeZone,
    healAura: def.healAura || 0,
  };
  world.buildings.push(building);
  return building;
}

export function updateBuildings(world, player, dt) {
  for (const b of world.buildings) {
    if (b.type === 'campfire' && b.healAura) {
      const cx = b.x + (b.size * CONFIG.tile) / 2;
      const cy = b.y + (b.size * CONFIG.tile) / 2;
      const d = Math.hypot(player.x - cx, player.y - cy);
      if (d < 80 && player.alive) {
        player.heal(b.healAura * dt);
      }
    }
    if (b.safeZone) {
      const cx = b.x + (b.size * CONFIG.tile) / 2;
      const cy = b.y + (b.size * CONFIG.tile) / 2;
      const d = Math.hypot(player.x - cx, player.y - cy);
      if (d < 100) player._inShelter = true;
    }
  }
}
