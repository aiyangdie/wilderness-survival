import { ITEMS, ENTITY_LABELS, RESOURCES } from './config.js';

const _proj = { x: 0, y: 0 };

/** HUD、世界标签、浮动文字、指南针 */
export class GameUI {
  constructor() {
    this.els = {
      bars: {
        health: document.getElementById('bar-health'),
        hunger: document.getElementById('bar-hunger'),
        thirst: document.getElementById('bar-thirst'),
        stamina: document.getElementById('bar-stamina'),
      },
      vals: {
        health: document.getElementById('val-health'),
        hunger: document.getElementById('val-hunger'),
        thirst: document.getElementById('val-thirst'),
        stamina: document.getElementById('val-stamina'),
      },
      staminaWrap: document.querySelector('[data-stat="stamina"]'),
      day: document.getElementById('h-day'),
      time: document.getElementById('h-time'),
      score: document.getElementById('val-score'),
      dayProgress: document.getElementById('day-progress'),
      crosshair: document.getElementById('crosshair'),
      interact: document.getElementById('interact-prompt'),
      interactProgress: document.getElementById('interact-progress'),
      interactProgressWrap: document.getElementById('interact-progress-wrap'),
      inventory: document.getElementById('inventory-bar'),
      hint: document.getElementById('hint'),
      toast: document.getElementById('toast'),
      damageFlash: document.getElementById('damage-flash'),
      lowVignette: document.getElementById('low-health-vignette'),
      worldLabels: document.getElementById('world-labels'),
      floatLayer: document.getElementById('float-layer'),
      compass: document.getElementById('compass-arrow'),
      spawnShield: document.getElementById('spawn-shield'),
      start: document.getElementById('overlay-start'),
      dead: document.getElementById('overlay-dead'),
      pause: document.getElementById('overlay-pause'),
      sensX: document.getElementById('sens-x'),
      sensY: document.getElementById('sens-y'),
      sensValX: document.getElementById('sens-val-x'),
      sensValY: document.getElementById('sens-val-y'),
    };
    this._labelPool = [];
    this._floats = [];
    this._vec = { x: 0, y: 0, z: 0 };
  }

  showStart(show) {
    this.els.start.classList.toggle('show', show);
  }

  showDead(show, day, score) {
    this.els.dead.classList.toggle('show', show);
    if (show) {
      document.getElementById('dead-day').textContent = String(day);
      document.getElementById('dead-score').textContent = String(score);
    }
  }

  showPause(show) {
    this.els.pause.classList.toggle('show', show);
  }

  setPointerHint(locked, paused) {
    if (paused) {
      this.els.hint.textContent = '游戏已暂停';
      this.els.crosshair.classList.remove('visible');
      return;
    }
    this.els.crosshair.classList.toggle('visible', locked);
    if (!locked) {
      this.els.hint.textContent = '点击画面开始 · Esc 暂停 · C 烤肉';
      this.clearInteractPrompt();
    }
  }

  updateBars(player, sprinting) {
    const set = (key, v, max = 100) => {
      const pct = Math.max(0, Math.min(100, (v / max) * 100));
      this.els.bars[key].style.width = `${pct}%`;
      this.els.vals[key].textContent = Math.ceil(v);
      const wrap = this.els.bars[key].parentElement;
      wrap.classList.toggle('low', pct < 25);
      wrap.classList.toggle('critical', pct < 12);
    };
    set('health', player.health);
    set('hunger', player.hunger);
    set('thirst', player.thirst);
    set('stamina', player.stamina);

    this.els.staminaWrap?.classList.toggle('dim', player.stamina > 92 && !sprinting);
    this.els.lowVignette?.classList.toggle('active', player.health < 28 && player.alive);
  }

  updateMeta(day, phaseLabel, time01, score, phase) {
    this.els.day.textContent = `第 ${day} 天`;
    this.els.time.textContent = phaseLabel;
    this.els.score.textContent = String(score);
    this.els.dayProgress.style.width = `${time01 * 100}%`;
    this.els.dayProgress.parentElement?.classList.toggle('phase-night', phase === 'night');
  }

  updateCompass(yaw) {
    if (!this.els.compass) return;
    const deg = (yaw * 180) / Math.PI;
    this.els.compass.style.transform = `rotate(${deg}deg)`;
  }

  updateSpawnShield(secondsLeft) {
    const el = this.els.spawnShield;
    if (!el) return;
    if (secondsLeft > 0) {
      el.classList.add('show');
      el.textContent = `🛡️ 保护 ${secondsLeft.toFixed(1)}s`;
    } else {
      el.classList.remove('show');
    }
  }

  updateInventory(inventory) {
    const el = this.els.inventory;
    el.innerHTML = '';
    const order = ['wood', 'stone', 'fiber', 'meat', 'cooked_meat'];
    const keys = [...new Set([...order, ...Object.keys(inventory)])];
    let any = false;
    for (const id of keys) {
      const count = inventory[id];
      if (!count || count <= 0) continue;
      any = true;
      const def = ITEMS[id] || { icon: '?', name: id };
      const chip = document.createElement('div');
      chip.className = 'inv-chip';
      chip.title = def.name;
      chip.innerHTML = `<span>${def.icon}</span><b>${count}</b><small>${def.name}</small>`;
      el.appendChild(chip);
    }
    if (!any) el.innerHTML = '<span class="inv-empty">暂无资源 · C 可烤肉</span>';
  }

  setInteractPrompt(text, mode = 'neutral', hpRatio = null) {
    const el = this.els.interact;
    const prog = this.els.interactProgress;
    const wrap = this.els.interactProgressWrap;
    el.classList.remove('show', 'mode-danger', 'mode-resource', 'mode-item', 'mode-neutral', 'mode-catch');
    wrap?.classList.remove('visible');
    if (!text) return;
    el.textContent = text;
    el.classList.add('show', `mode-${mode}`);
    if (hpRatio !== null && prog && wrap) {
      wrap.classList.add('visible');
      prog.style.width = `${Math.max(0, Math.min(100, hpRatio * 100))}%`;
    }
  }

  clearInteractPrompt() {
    this.setInteractPrompt(null);
  }

  setCrosshairMode(mode, attacking = false) {
    const ch = this.els.crosshair;
    ch.dataset.mode = mode || 'neutral';
    ch.classList.toggle('attack', attacking);
  }

  flashDamage() {
    this.els.damageFlash.classList.add('hit');
    clearTimeout(this._flashT);
    this._flashT = setTimeout(() => this.els.damageFlash.classList.remove('hit'), 280);
  }

  toast(msg, type = 'info') {
    const el = this.els.toast;
    el.textContent = msg;
    el.className = `show type-${type}`;
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 2400);
  }

  floatDamage(x, y, z, amount, camera, width, height) {
    this._spawnFloat(`-${Math.round(amount)}`, x, y + 1.8, z, camera, width, height, 'damage');
  }

  floatPickup(itemId, count, x, y, z, camera, width, height) {
    const def = ITEMS[itemId] || { icon: '+', name: itemId };
    this._spawnFloat(`${def.icon}+${count}`, x, y + 1.5, z, camera, width, height, 'pickup');
  }

  _spawnFloat(text, x, y, z, camera, width, height, kind) {
    const pos = this._project(x, y, z, camera, width, height);
    if (!pos) return;
    const el = document.createElement('div');
    el.className = `float-text ${kind}`;
    el.textContent = text;
    el.style.left = `${pos.x}px`;
    el.style.top = `${pos.y}px`;
    this.els.floatLayer.appendChild(el);
    const life = { el, vy: -40, age: 0, max: 0.9 };
    this._floats.push(life);
  }

  _project(x, y, z, camera, width, height) {
    this._vec.x = x;
    this._vec.y = y;
    this._vec.z = z;
    const v = this._vec;
    v.project(camera);
    if (v.z > 1) return null;
    return {
      x: (v.x * 0.5 + 0.5) * width,
      y: (-v.y * 0.5 + 0.5) * height,
    };
  }

  updateFloats(dt) {
    for (let i = this._floats.length - 1; i >= 0; i--) {
      const f = this._floats[i];
      f.age += dt;
      f.vy -= 20 * dt;
      const top = parseFloat(f.el.style.top) + f.vy * dt;
      f.el.style.top = `${top}px`;
      f.el.style.opacity = String(1 - f.age / f.max);
      if (f.age >= f.max) {
        f.el.remove();
        this._floats.splice(i, 1);
      }
    }
  }

  updateWorldLabels(entities, focus, camera, width, height, maxDist = 22) {
    const container = this.els.worldLabels;
    const need = [];

    for (const e of entities) {
      if (e.dead) continue;
      const dx = e.x - camera.position.x;
      const dz = e.z - camera.position.z;
      if (Math.hypot(dx, dz) > maxDist) continue;
      const isHostile = !!e.def?.hostile;
      if (e.hp >= e.maxHp - 0.5 && !isHostile) continue;
      if (!RESOURCES[e.type] && !e.passive && !isHostile) continue;

      const pos = this._project(e.x, e.y + 2.2, e.z, camera, width, height);
      if (!pos) continue;
      need.push({ e, pos, pct: e.hp / e.maxHp });
    }

    while (this._labelPool.length < need.length) {
      const d = document.createElement('div');
      d.className = 'world-label';
      d.innerHTML = '<span class="wl-name"></span><div class="wl-bar"><div class="wl-fill"></div></div>';
      container.appendChild(d);
      this._labelPool.push(d);
    }

    this._labelPool.forEach((d, i) => {
      if (i >= need.length) {
        d.style.display = 'none';
        return;
      }
      const { e, pos, pct } = need[i];
      d.style.display = 'block';
      d.style.left = `${pos.x}px`;
      d.style.top = `${pos.y}px`;
      d.querySelector('.wl-name').textContent = ENTITY_LABELS[e.type] || e.type;
      d.querySelector('.wl-fill').style.width = `${pct * 100}%`;
      d.classList.toggle('hostile', !!e.def?.hostile);
      d.classList.toggle('focus', focus?.entity === e);
    });
  }

  bindPauseControls(input, onResume) {
    document.getElementById('btn-resume')?.addEventListener('click', onResume);
    document.getElementById('btn-pause-restart')?.addEventListener('click', () => {
      this.showPause(false);
      document.getElementById('btn-restart')?.click();
    });

    const sync = () => {
      input.sensX = parseFloat(this.els.sensX.value);
      input.sensY = parseFloat(this.els.sensY.value);
      this.els.sensValX.textContent = input.sensX.toFixed(4);
      this.els.sensValY.textContent = input.sensY.toFixed(4);
      input.saveSensitivity();
    };
    this.els.sensX.value = input.sensX;
    this.els.sensY.value = input.sensY;
    sync();
    this.els.sensX.addEventListener('input', sync);
    this.els.sensY.addEventListener('input', sync);
  }

  getTargetPrompt(target, inventory) {
    if (!target) {
      if ((inventory.cooked_meat || 0) > 0) return { text: '[E] 食用熟肉', mode: 'item', hpRatio: null };
      if ((inventory.meat || 0) > 0) return { text: '[E] 食用生肉', mode: 'item', hpRatio: null };
      return null;
    }
    if (target.kind === 'catch') {
      const name = ENTITY_LABELS[target.type] || target.type;
      return { text: `[E] 捕获${name}`, mode: 'catch', hpRatio: target.hp / target.maxHp };
    }
    if (target.kind === 'resource') {
      const verb = target.def?.verb || '采集';
      const name = ENTITY_LABELS[target.type] || target.type;
      if (target.type === 'bush') {
        return {
          text: `[E] ${verb}${name} / 饮水`,
          mode: 'resource',
          hpRatio: 1 - target.hp / target.maxHp,
        };
      }
      return {
        text: `[E] ${verb}${name}`,
        mode: 'resource',
        hpRatio: 1 - target.hp / target.maxHp,
      };
    }
    if (target.kind === 'hostile') {
      return {
        text: `[左键] 攻击 ${ENTITY_LABELS[target.type] || target.type}`,
        mode: 'danger',
        hpRatio: target.hp / target.maxHp,
      };
    }
    if (target.kind === 'passive') {
      const ratio = target.hp / target.maxHp;
      if (ratio <= 0.45) {
        return { text: `[E] 捕获 / [左键] 狩猎`, mode: 'catch', hpRatio: ratio };
      }
      return { text: `[左键] 狩猎 ${ENTITY_LABELS[target.type] || target.type}`, mode: 'neutral', hpRatio: ratio };
    }
    return null;
  }
}
