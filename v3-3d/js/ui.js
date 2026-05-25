import * as THREE from 'three';
import { ITEMS, ENTITY_LABELS, RESOURCES, RECIPES, CFG } from './config.js';
import { SURVIVAL_GUIDE } from './survival.js';

const CATCH_HP_RATIO = CFG.player.catchHpRatio;
const CATCH_CLOSE_DIST = CFG.player.catchCloseDist ?? 4.5;

const FLOAT_POOL = 10;
const LABEL_MAX = 4;

/** HUD — 分层刷新、DOM 池化，减少卡顿 */
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
      fps: document.getElementById('fps-counter'),
      survivalHint: document.getElementById('survival-hint'),
      guide: document.getElementById('overlay-guide'),
      guideBody: document.getElementById('guide-body'),
      start: document.getElementById('overlay-start'),
      dead: document.getElementById('overlay-dead'),
      pause: document.getElementById('overlay-pause'),
      craft: document.getElementById('overlay-craft'),
      craftList: document.getElementById('craft-list'),
      equipSlots: document.getElementById('equip-slots'),
      sensX: document.getElementById('sens-x'),
      sensY: document.getElementById('sens-y'),
      sensValX: document.getElementById('sens-val-x'),
      sensValY: document.getElementById('sens-val-y'),
    };

    this._labelPool = [];
    this._floatPool = [];
    this._floatActive = [];
    this._projVec = new THREE.Vector3();
    this._invHash = '';
    this._lastPrompt = '';
    this._invDirty = true;
    this._barPct = {};

    for (let i = 0; i < LABEL_MAX; i++) {
      const d = document.createElement('div');
      d.className = 'world-label';
      d.innerHTML = '<span class="wl-name"></span><div class="wl-bar"><div class="wl-fill"></div></div>';
      d.style.display = 'none';
      this.els.worldLabels.appendChild(d);
      this._labelPool.push(d);
    }

    for (let i = 0; i < FLOAT_POOL; i++) {
      const el = document.createElement('div');
      el.className = 'float-text';
      el.style.display = 'none';
      this.els.floatLayer.appendChild(el);
      this._floatPool.push({ el, active: false, vy: 0, age: 0, max: 0.9, screenX: 0, screenY: 0 });
    }
  }

  markInventoryDirty() {
    this._invDirty = true;
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

  showGuide(show) {
    const el = this.els.guide;
    if (!el) return;
    el.classList.toggle('show', show);
    if (show && this.els.guideBody && !this.els.guideBody.childElementCount) {
      for (const sec of SURVIVAL_GUIDE) {
        const block = document.createElement('section');
        block.className = 'guide-block';
        block.innerHTML = `<h3>${sec.title}</h3><ul>${sec.lines.map((l) => `<li>${l}</li>`).join('')}</ul>`;
        this.els.guideBody.appendChild(block);
      }
    }
  }

  setSurvivalHint(text) {
    const el = this.els.survivalHint;
    if (!el || el.textContent === text) return;
    el.textContent = text;
  }

  setFps(fps) {
    if (!this.els.fps) return;
    this.els.fps.textContent = `${Math.round(fps)} FPS`;
    this.els.fps.classList.toggle('low', fps < 45);
  }

  setPointerHint(locked, paused) {
    if (paused) {
      this.els.hint.textContent = '游戏已暂停';
      this.els.hint.classList.remove('hidden');
      this.els.crosshair.classList.remove('visible');
      return;
    }
    this.els.crosshair.classList.toggle('visible', locked);
    if (locked) {
      this.els.hint.textContent = 'WASD 移动 · Shift 跑 · 空格 跳 · 左键 攻击 · B 制作';
      this.els.hint.classList.add('compact');
    } else {
      this.els.hint.textContent = '点击画面锁定鼠标';
      this.els.hint.classList.remove('compact');
    }
  }

  updateBars(player, sprinting) {
    const set = (key, v, max = 100) => {
      const safe = Number.isFinite(v) ? Math.max(0, Math.min(max, v)) : max;
      const pct = Math.max(0, Math.min(100, (safe / max) * 100));
      if (this._barPct[key] !== pct) {
        this._barPct[key] = pct;
        this.els.bars[key].style.width = `${pct}%`;
      }
      this.els.vals[key].textContent = Math.ceil(safe);
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
    this.els.compass.style.transform = `rotate(${(yaw * 180) / Math.PI}deg)`;
  }

  updateSpawnShield(secondsLeft) {
    const el = this.els.spawnShield;
    if (!el) return;
    const show = secondsLeft > 0;
    el.classList.toggle('show', show);
    if (show) el.textContent = `🛡️ 保护 ${secondsLeft.toFixed(1)}s`;
  }

  updateInventory(inventory) {
    const hash = JSON.stringify(inventory);
    if (!this._invDirty && hash === this._invHash) return;
    this._invHash = hash;
    this._invDirty = false;

    const el = this.els.inventory;
    el.innerHTML = '';
    const order = [
      'wood', 'stone', 'fiber', 'plank', 'rope', 'meat', 'cooked_meat',
      'stone_axe', 'wooden_spear', 'leather_armor', 'backpack',
    ];
    let any = false;
    for (const id of order) {
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
    if (!any) el.innerHTML = '<span class="inv-empty">暂无资源 · B 打开制作</span>';
  }

  updateEquipment(slots = {}) {
    const el = this.els.equipSlots;
    if (!el) return;
    const labels = { weapon: '武器', armor: '护甲', accessory: '配件' };
    el.innerHTML = '';
    for (const [slot, label] of Object.entries(labels)) {
      const id = slots[slot];
      const def = id ? ITEMS[id] : null;
      const chip = document.createElement('div');
      chip.className = `equip-chip${def ? ' filled' : ''}`;
      chip.innerHTML = def
        ? `<span>${def.icon}</span><small>${def.name}</small>`
        : `<span>—</span><small>${label}</small>`;
      el.appendChild(chip);
    }
  }

  showCraft(show, inventory, craftSys, ctx = {}) {
    this.els.craft?.classList.toggle('show', show);
    if (show && craftSys) this.renderCraftList(inventory, craftSys, ctx);
  }

  renderCraftList(inventory, craftSys, ctx = {}) {
    const list = this.els.craftList;
    if (!list) return;
    list.innerHTML = '';
    for (const { id, name, icon, costs, desc, category, build } of craftSys.getRecipeList()) {
      const can = craftSys.canCraft(id, inventory, ctx);
      const costMap =
        id === 'cooked_meat' && craftSys._recipeCosts
          ? craftSys._recipeCosts(id, ctx)
          : costs;
      const costStr = Object.entries(costMap || costs)
        .map(([k, v]) => `${ITEMS[k]?.icon || k}×${v}`)
        .join(' ');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `craft-item${can ? '' : ' disabled'}`;
      btn.innerHTML = `
        <span class="ci-icon">${icon}</span>
        <span class="ci-body">
          <b>${name}</b>
          <small>${desc || ''}</small>
          <em>${costStr}</em>
        </span>
        <span class="ci-tag">${build ? '建造' : category}</span>`;
      btn.disabled = !can;
      btn.addEventListener('click', () => {
        if (this.onCraftRecipe) this.onCraftRecipe(id);
      });
      list.appendChild(btn);
    }
  }

  setInteractPrompt(text, mode = 'neutral', hpRatio = null) {
    const key = `${text}|${mode}|${hpRatio}`;
    if (key === this._lastPrompt) return;
    this._lastPrompt = key;

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
    this._lastPrompt = '';
    this.els.interact.classList.remove('show', 'mode-danger', 'mode-resource', 'mode-item', 'mode-neutral', 'mode-catch');
    this.els.interactProgressWrap?.classList.remove('visible');
  }

  setCrosshairMode(mode, attacking = false) {
    const ch = this.els.crosshair;
    ch.dataset.mode = mode || 'neutral';
    ch.classList.toggle('attack', attacking);
    ch.classList.toggle('tps', true);
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
    const slot = this._floatPool.find((f) => !f.active);
    if (!slot) return;
    slot.active = true;
    slot.age = 0;
    slot.vy = -40;
    slot.screenX = pos.x;
    slot.screenY = pos.y;
    slot.el.className = `float-text ${kind}`;
    slot.el.textContent = text;
    slot.el.style.display = 'block';
    slot.el.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0) translate(-50%, -50%)`;
    slot.el.style.opacity = '1';
    this._floatActive.push(slot);
  }

  _project(x, y, z, camera, width, height) {
    this._projVec.set(x, y, z).project(camera);
    if (this._projVec.z > 1) return null;
    return {
      x: (this._projVec.x * 0.5 + 0.5) * width,
      y: (-this._projVec.y * 0.5 + 0.5) * height,
    };
  }

  updateFloats(dt) {
    for (let i = this._floatActive.length - 1; i >= 0; i--) {
      const f = this._floatActive[i];
      f.age += dt;
      f.vy -= 20 * dt;
      f.screenY += f.vy * dt;
      f.el.style.transform = `translate3d(${f.screenX}px, ${f.screenY}px, 0) translate(-50%, -50%)`;
      f.el.style.opacity = String(Math.max(0, 1 - f.age / f.max));
      if (f.age >= f.max) {
        f.active = false;
        f.el.style.display = 'none';
        this._floatActive.splice(i, 1);
      }
    }
  }

  updateWorldLabels(entities, focus, camera, width, height, playerX, playerZ) {
    const need = [];
    const add = (e, priority) => {
      if (need.length >= LABEL_MAX) return;
      const pos = this._project(e.x, e.y + 2, e.z, camera, width, height);
      if (!pos) return;
      need.push({ e, pos, pct: e.hp / e.maxHp, priority });
    };

    if (focus?.entity && !focus.entity.dead) add(focus.entity, 0);

    for (const e of entities) {
      if (e.dead || e === focus?.entity) continue;
      const dist = Math.hypot(e.x - playerX, e.z - playerZ);
      if (dist > 18) continue;
      const hostile = !!e.def?.hostile;
      if (!hostile && e.hp >= e.maxHp - 0.5) continue;
      if (!hostile && !e.passive && !RESOURCES[e.type]) continue;
      add(e, hostile ? 1 : 2);
    }

    need.sort((a, b) => a.priority - b.priority);

    for (let i = 0; i < this._labelPool.length; i++) {
      const d = this._labelPool[i];
      if (i >= need.length) {
        d.style.display = 'none';
        continue;
      }
      const { e, pos, pct } = need[i];
      d.style.display = 'block';
      d.style.left = `${pos.x}px`;
      d.style.top = `${pos.y}px`;
      d.querySelector('.wl-name').textContent = ENTITY_LABELS[e.type] || e.type;
      d.querySelector('.wl-fill').style.width = `${pct * 100}%`;
      d.classList.toggle('hostile', !!e.def?.hostile);
      d.classList.toggle('focus', focus?.entity === e);
    }
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

  getTargetPrompt(target, inventory, ctx = {}) {
    if (!target) {
      if (ctx.nearShelter) return { text: '[按住 E] 在棚屋休息', mode: 'item', hpRatio: null };
      if (ctx.nearCampfire && (inventory.meat || 0) > 0) {
        return { text: '[C] 篝火烤肉（仅消耗生肉）', mode: 'item', hpRatio: null };
      }
      if ((inventory.cooked_meat || 0) > 0) return { text: '[E] 食用熟肉', mode: 'item', hpRatio: null };
      if ((inventory.meat || 0) > 0) return { text: '[E] 食用生肉 / [C] 烤肉', mode: 'item', hpRatio: null };
      if ((inventory.fiber || 0) > 0 && (ctx.hunger ?? 100) < 70) {
        return { text: '[E] 嚼纤维充饥', mode: 'neutral', hpRatio: null };
      }
      return null;
    }
    if (target.kind === 'catch') {
      const name = ENTITY_LABELS[target.type] || target.type;
      return { text: `[E] 捕获${name}`, mode: 'catch', hpRatio: target.hp / target.maxHp };
    }
    if (target.kind === 'resource') {
      const verb = target.def?.verb || '采集';
      const name = ENTITY_LABELS[target.type] || target.type;
      const ratio = 1 - target.hp / target.maxHp;
      if (target.type === 'bush') {
        const drink =
          (ctx.thirst ?? 100) < 95 ? ' / 饮水' : '';
        return { text: `[E] ${verb}${name}${drink}`, mode: 'resource', hpRatio: ratio };
      }
      return { text: `[E] ${verb}${name}`, mode: 'resource', hpRatio: ratio };
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
      if (ratio <= CATCH_HP_RATIO) {
        return { text: `[E] 捕获（已削弱）`, mode: 'catch', hpRatio: ratio };
      }
      if (target.dist <= CATCH_CLOSE_DIST) {
        return { text: `[E] 近距离捕获 / [左键] 狩猎`, mode: 'catch', hpRatio: ratio };
      }
      return { text: `[Shift] 冲刺追猎 · [左键] 打伤后 E 捕获`, mode: 'neutral', hpRatio: ratio };
    }
    return null;
  }
}
