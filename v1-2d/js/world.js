import { CONFIG, ENTITY_TYPES } from './config.js';
import { randInt, tileAt } from './utils.js';

export class World {
  constructor() {
    const { width, height } = CONFIG.world;
    this.width = width;
    this.height = height;
    this.tileSize = CONFIG.tile;
    this.tiles = new Uint8Array(width * height);
    this.entities = [];
    this.buildings = [];
    this.spawnX = (width * CONFIG.tile) / 2;
    this.spawnY = (height * CONFIG.tile) / 2;
  }

  generate() {
    const { width, height } = this;
    for (let i = 0; i < this.tiles.length; i++) {
      const x = i % width;
      const y = Math.floor(i / width);
      const edge = x < 3 || y < 3 || x >= width - 3 || y >= height - 3;
      const noise = Math.sin(x * 0.31) * Math.cos(y * 0.27) + Math.random() * 0.4;
      if (edge) this.tiles[i] = 2;
      else if (noise > 0.85) this.tiles[i] = 2;
      else if (noise < -0.35) this.tiles[i] = 3;
      else this.tiles[i] = 1;
    }

    const place = (type, count) => {
      for (let n = 0; n < count; n++) {
        const pos = this.randomLandTile();
        if (!pos) continue;
        this.entities.push(createEntity(type, pos.x, pos.y));
      }
    };

    place('tree', CONFIG.spawn.trees);
    place('rock', CONFIG.spawn.rocks);
    place('bush', CONFIG.spawn.bushes);
    place('deer', CONFIG.spawn.deer);
    place('rabbit', CONFIG.spawn.rabbit);
    place('wolf', CONFIG.spawn.wolf);
  }

  randomLandTile(attempts = 40) {
    const ts = this.tileSize;
    for (let i = 0; i < attempts; i++) {
      const tx = randInt(5, this.width - 6);
      const ty = randInt(5, this.height - 6);
      if (tileAt(this, tx, ty) === 1) {
        return { x: tx * ts + ts / 2, y: ty * ts + ts / 2, tx, ty };
      }
    }
    return null;
  }

  isBlocked(x, y, radius = 10) {
    const ts = this.tileSize;
    const tx = Math.floor(x / ts);
    const ty = Math.floor(y / ts);
    const t = tileAt(this, tx, ty);
    if (t === 2 || t === 3) return true;

    for (const b of this.buildings) {
      if (b.blocks && distPointRect(x, y, b)) return true;
    }
    return false;
  }

  getInteractable(px, py, range) {
    let best = null;
    let bestD = range;
    for (const e of this.entities) {
      if (e.dead || e.type === 'wolf' || e.type === 'shadow' || e.type === 'deer' || e.type === 'rabbit') continue;
      if (e.hp <= 0 && e.type !== 'tree' && e.type !== 'rock' && e.type !== 'bush') continue;
      const d = Math.hypot(e.x - px, e.y - py);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  getAttackTarget(px, py, range) {
    let best = null;
    let bestD = range;
    for (const e of this.entities) {
      if (e.dead) continue;
      if (!['deer', 'rabbit', 'wolf', 'shadow', 'tree', 'rock', 'bush'].includes(e.type)) continue;
      const d = Math.hypot(e.x - px, e.y - py);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  removeEntity(entity) {
    const i = this.entities.indexOf(entity);
    if (i >= 0) this.entities.splice(i, 1);
  }

  spawnNightMonsters() {
    const count = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < count; i++) {
      const pos = this.randomLandTile();
      if (pos) this.entities.push(createEntity('shadow', pos.x, pos.y));
    }
  }
}

function distPointRect(px, py, b) {
  const ts = CONFIG.tile;
  const size = (b.size || 1) * ts;
  return px >= b.x && px <= b.x + size && py >= b.y && py <= b.y + size;
}

export function createEntity(type, x, y) {
  const def = ENTITY_TYPES[type];
  return {
    id: crypto.randomUUID(),
    type,
    x,
    y,
    vx: 0,
    vy: 0,
    hp: def.hp,
    maxHp: def.hp,
    dead: false,
    wanderTimer: Math.random() * 2,
    aggroTarget: null,
    fleeTimer: 0,
    def,
  };
}
