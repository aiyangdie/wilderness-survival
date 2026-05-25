import { ITEMS, ENTITY_LABELS } from './config.js';

/** HUD、交互提示、背包、暂停、受击反馈 */
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
      day: document.getElementById('h-day'),
      time: document.getElementById('h-time'),
      score: document.getElementById('val-score'),
      dayProgress: document.getElementById('day-progress'),
      crosshair: document.getElementById('crosshair'),
      interact: document.getElementById('interact-prompt'),
      inventory: document.getElementById('inventory-bar'),
      hint: document.getElementById('hint'),
      toast: document.getElementById('toast'),
      damageFlash: document.getElementById('damage-flash'),
      start: document.getElementById('overlay-start'),
      dead: document.getElementById('overlay-dead'),
      pause: document.getElementById('overlay-pause'),
      sensX: document.getElementById('sens-x'),
      sensY: document.getElementById('sens-y'),
      sensValX: document.getElementById('sens-val-x'),
      sensValY: document.getElementById('sens-val-y'),
    };
    this.toastQueue = [];
    this.flashTimer = 0;
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
      this.els.hint.textContent = '点击画面开始 · Esc 暂停';
      this.els.interact.classList.remove('show');
    }
  }

  updateBars(player) {
    const set = (key, v, max = 100) => {
      const pct = Math.max(0, Math.min(100, (v / max) * 100));
      this.els.bars[key].style.width = `${pct}%`;
      this.els.vals[key].textContent = Math.ceil(v);
      this.els.bars[key].parentElement.classList.toggle('low', pct < 25);
      this.els.bars[key].parentElement.classList.toggle('critical', pct < 12);
    };
    set('health', player.health);
    set('hunger', player.hunger);
    set('thirst', player.thirst);
    set('stamina', player.stamina);
  }

  updateMeta(day, phaseLabel, time01, score) {
    this.els.day.textContent = `第 ${day} 天`;
    this.els.time.textContent = phaseLabel;
    this.els.score.textContent = String(score);
    this.els.dayProgress.style.width = `${time01 * 100}%`;
  }

  updateInventory(inventory) {
    const el = this.els.inventory;
    el.innerHTML = '';
    for (const [id, count] of Object.entries(inventory)) {
      if (count <= 0) continue;
      const def = ITEMS[id] || { icon: '?', name: id };
      const chip = document.createElement('div');
      chip.className = 'inv-chip';
      chip.title = def.name;
      chip.innerHTML = `<span>${def.icon}</span><b>${count}</b>`;
      el.appendChild(chip);
    }
    if (!el.children.length) {
      el.innerHTML = '<span class="inv-empty">暂无资源</span>';
    }
  }

  setInteractPrompt(text, mode = 'neutral') {
    const el = this.els.interact;
    el.classList.remove('show', 'mode-danger', 'mode-resource', 'mode-item', 'mode-neutral');
    if (!text) return;
    el.textContent = text;
    el.classList.add('show', `mode-${mode}`);
  }

  setCrosshairMode(mode) {
    this.els.crosshair.dataset.mode = mode || 'neutral';
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
      if ((inventory.meat || 0) > 0) return { text: '[E] 食用生肉', mode: 'item' };
      return null;
    }
    if (target.kind === 'resource') {
      const verb = target.def?.verb || '采集';
      const name = ENTITY_LABELS[target.type] || target.type;
      const pct = Math.ceil((target.hp / target.maxHp) * 100);
      return { text: `[E] ${verb}${name} (${pct}%)`, mode: 'resource' };
    }
    if (target.kind === 'hostile') {
      return { text: `[左键] 攻击 ${ENTITY_LABELS[target.type] || target.type}`, mode: 'danger' };
    }
    if (target.kind === 'passive') {
      return { text: `[左键] 狩猎 / [E] 靠近捕获`, mode: 'neutral' };
    }
    return null;
  }
}
