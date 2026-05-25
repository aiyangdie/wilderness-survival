import { CONFIG, ENTITY_TYPES, BUILDINGS } from './config.js';

const TILE_COLORS = {
  1: '#3d5a3c',
  2: '#1b4332',
  3: '#4a6fa5',
};

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.camera = { x: 0, y: 0 };
  }

  follow(targetX, targetY) {
    const { width, height } = CONFIG.canvas;
    const worldW = CONFIG.world.width * CONFIG.tile;
    const worldH = CONFIG.world.height * CONFIG.tile;
    this.camera.x = Math.max(0, Math.min(targetX - width / 2, worldW - width));
    this.camera.y = Math.max(0, Math.min(targetY - height / 2, worldH - height));
  }

  clear(light = 1) {
    const ctx = this.ctx;
    ctx.fillStyle = `rgba(5, 8, 12, ${1 - light * 0.15})`;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  drawWorld(world, dayLight) {
    const ctx = this.ctx;
    const ts = CONFIG.tile;
    const cam = this.camera;
    const startTx = Math.floor(cam.x / ts);
    const startTy = Math.floor(cam.y / ts);
    const endTx = Math.ceil((cam.x + CONFIG.canvas.width) / ts);
    const endTy = Math.ceil((cam.y + CONFIG.canvas.height) / ts);

    for (let ty = startTy; ty < endTy; ty++) {
      for (let tx = startTx; tx < endTx; tx++) {
        if (tx < 0 || ty < 0 || tx >= world.width || ty >= world.height) continue;
        const t = world.tiles[ty * world.width + tx];
        const sx = tx * ts - cam.x;
        const sy = ty * ts - cam.y;
        ctx.fillStyle = TILE_COLORS[t] || '#333';
        ctx.fillRect(sx, sy, ts + 1, ts + 1);
      }
    }

    for (const b of world.buildings) {
      this.drawBuilding(b);
    }

    const sorted = [...world.entities].sort((a, b) => a.y - b.y);
    for (const e of sorted) {
      if (e.dead) continue;
      this.drawEntity(e);
    }

    if (dayLight < 1) {
      ctx.fillStyle = `rgba(8, 12, 32, ${(1 - dayLight) * 0.72})`;
      ctx.fillRect(0, 0, CONFIG.canvas.width, CONFIG.canvas.height);
    }
  }

  drawBuilding(b) {
    const ctx = this.ctx;
    const def = BUILDINGS[b.type];
    const ts = CONFIG.tile;
    const sx = b.x - this.camera.x;
    const sy = b.y - this.camera.y;
    const size = b.size * ts;

    ctx.fillStyle = b.type === 'campfire' ? '#8b4513' : b.type === 'shelter' ? '#6b4f3a' : '#5c4033';
    ctx.fillRect(sx, sy, size, size);
    ctx.font = `${ts * 0.7}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(def?.icon || '?', sx + size / 2, sy + size / 2);
  }

  drawEntity(e) {
    const def = e.def || ENTITY_TYPES[e.type];
    const ctx = this.ctx;
    const sx = e.x - this.camera.x;
    const sy = e.y - this.camera.y;
    const r = e.type === 'tree' ? 18 : e.type === 'rock' ? 14 : 12;

    ctx.fillStyle = def.color || '#888';
    ctx.beginPath();
    if (e.type === 'tree') {
      ctx.fillRect(sx - 6, sy - 4, 12, 16);
      ctx.fillStyle = '#1b4332';
      ctx.beginPath();
      ctx.arc(sx, sy - 10, 14, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.font = '16px serif';
    ctx.textAlign = 'center';
    ctx.fillText(def.icon || '', sx, sy - (e.type === 'tree' ? 22 : 4));

    if (e.hp < e.maxHp && !['deer', 'rabbit'].includes(e.type)) {
      const w = 28;
      const pct = e.hp / e.maxHp;
      ctx.fillStyle = '#222';
      ctx.fillRect(sx - w / 2, sy - 28, w, 4);
      ctx.fillStyle = '#3ecf8e';
      ctx.fillRect(sx - w / 2, sy - 28, w * pct, 4);
    }
  }

  drawPlayer(player, attackAnim) {
    const ctx = this.ctx;
    const sx = player.x - this.camera.x;
    const sy = player.y - this.camera.y;

    if (player.invuln > 0 && Math.floor(player.invuln * 10) % 2 === 0) {
      ctx.globalAlpha = 0.5;
    }

    ctx.fillStyle = '#e9c46a';
    ctx.beginPath();
    ctx.arc(sx, sy, player.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#2a9d8f';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    const reach = attackAnim > 0 ? 28 : 18;
    ctx.lineTo(sx + Math.cos(player.facing) * reach, sy + Math.sin(player.facing) * reach);
    ctx.stroke();

    ctx.globalAlpha = 1;
    ctx.font = '14px serif';
    ctx.textAlign = 'center';
    ctx.fillText('🧑', sx, sy - 20);
  }

  drawPlacementPreview(type, wx, wy, valid) {
    const def = BUILDINGS[type];
    if (!def) return;
    const ts = CONFIG.tile;
    const tx = Math.floor(wx / ts) * ts - this.camera.x;
    const ty = Math.floor(wy / ts) * ts - this.camera.y;
    const size = def.size * ts;
    const ctx = this.ctx;
    ctx.strokeStyle = valid ? '#3ecf8e' : '#e85d5d';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(tx, ty, size, size);
    ctx.setLineDash([]);
  }

  drawMinimap(world, player) {
    const ctx = this.ctx;
    const mw = 120;
    const mh = 80;
    const mx = CONFIG.canvas.width - mw - 10;
    const my = 10;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(mx, my, mw, mh);
    const scaleX = mw / (world.width * CONFIG.tile);
    const scaleY = mh / (world.height * CONFIG.tile);
    ctx.fillStyle = '#3ecf8e';
    ctx.fillRect(mx + player.x * scaleX - 2, my + player.y * scaleY - 2, 4, 4);
  }
}
