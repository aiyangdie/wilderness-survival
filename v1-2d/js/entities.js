import { CONFIG, ENTITY_TYPES } from './config.js';
import { clamp, dist } from './utils.js';

export function updateEntities(world, player, dt, isNight) {
  const px = player.x;
  const py = player.y;

  for (const e of world.entities) {
    if (e.dead) continue;
    const def = e.def || ENTITY_TYPES[e.type];
    if (!def) continue;

    if (e.type === 'deer' || e.type === 'rabbit') {
      updatePassive(e, def, px, py, world, dt);
    } else if (e.type === 'wolf' || e.type === 'shadow') {
      if (def.nightOnly && !isNight) {
        e.vx = e.vy = 0;
        continue;
      }
      updateHostile(e, def, player, world, dt, isNight);
    }
  }
}

function updatePassive(e, def, px, py, world, dt) {
  const d = dist(e.x, e.y, px, py);
  if (d < 120) {
    e.fleeTimer = 2.5;
  }
  if (e.fleeTimer > 0) {
    e.fleeTimer -= dt;
    const angle = Math.atan2(e.y - py, e.x - px);
    e.vx = Math.cos(angle) * def.speed * 1.2;
    e.vy = Math.sin(angle) * def.speed * 1.2;
  } else {
    wander(e, def, dt);
  }
  moveEntity(e, world, dt);
}

function updateHostile(e, def, player, world, dt, isNight) {
  const d = dist(e.x, e.y, player.x, player.y);
  const range = def.aggro || 160;

  if (d < range && player.alive) {
    e.aggroTarget = player;
    const angle = Math.atan2(player.y - e.y, player.x - e.x);
    const mult = e.type === 'shadow' && isNight ? 1.25 : 1;
    e.vx = Math.cos(angle) * def.speed * mult;
    e.vy = Math.sin(angle) * def.speed * mult;

    if (d < 22 && player.invuln <= 0) {
      player.takeDamage(def.damage || 10);
    }
  } else {
    e.aggroTarget = null;
    wander(e, def, dt * 0.6);
  }
  moveEntity(e, world, dt);
}

function wander(e, def, dt) {
  e.wanderTimer -= dt;
  if (e.wanderTimer <= 0) {
    e.wanderTimer = 1.5 + Math.random() * 2;
    const a = Math.random() * Math.PI * 2;
    e.vx = Math.cos(a) * def.speed * 0.35;
    e.vy = Math.sin(a) * def.speed * 0.35;
  }
}

function moveEntity(e, world, dt) {
  let nx = e.x + e.vx * dt;
  let ny = e.y + e.vy * dt;
  if (!world.isBlocked(nx, e.y, 8)) e.x = nx;
  else e.vx *= -0.5;
  if (!world.isBlocked(e.x, ny, 8)) e.y = ny;
  else e.vy *= -0.5;
}

export function damageEntity(entity, amount, inventory, onKill) {
  entity.hp -= amount;
  if (entity.hp <= 0 && !entity.dead) {
    entity.dead = true;
    const drops = entity.def?.drop || {};
    for (const [id, n] of Object.entries(drops)) {
      inventory.add(id, n);
    }
    onKill?.(entity);
    return true;
  }
  return false;
}

export function tryCatch(player, entity, inventory) {
  if (entity.type !== 'rabbit' && entity.type !== 'deer') return false;
  const d = dist(player.x, player.y, entity.x, entity.y);
  if (d > 36) return false;
  if (entity.hp > entity.maxHp * 0.4) return false;
  inventory.add('meat', entity.type === 'deer' ? 2 : 1);
  if (entity.type === 'deer') inventory.add('leather', 1);
  entity.dead = true;
  return true;
}
