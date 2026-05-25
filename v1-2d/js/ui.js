import { ITEMS, RECIPES, BUILDINGS } from './config.js';

export class UI {
  constructor(refs) {
    this.refs = refs;
  }

  updateHUD(player, day, phaseName, dayLight) {
    const r = this.refs;
    r.health.querySelector('b').textContent = Math.ceil(player.health);
    r.hunger.querySelector('b').textContent = Math.ceil(player.hunger);
    r.thirst.querySelector('b').textContent = Math.ceil(player.thirst);
    r.stamina.querySelector('b').textContent = Math.ceil(player.stamina);
    r.day.querySelector('b').textContent = String(day);
    r.time.textContent = `${phaseIcon(phaseName)} ${phaseLabel(phaseName)}`;
    r.score.querySelector('b').textContent = String(player.score);

    r.health.style.color = player.health < 30 ? 'var(--danger)' : '';
    r.hunger.style.color = player.hunger < 25 ? 'var(--warn)' : '';
  }

  renderHotbar(inventory, activeIndex) {
    const el = this.refs.hotbar;
    el.innerHTML = '';
    for (let i = 0; i < 5; i++) {
      const slot = inventory.getHotbarSlot(i);
      const div = document.createElement('div');
      div.className = 'hotbar-slot' + (i === activeIndex ? ' active' : '');
      div.innerHTML = `
        <span class="key">${i + 1}</span>
        <span class="icon">${slot ? ITEMS[slot.id]?.icon || '?' : ''}</span>
        <span class="count">${slot && slot.count > 1 ? slot.count : ''}</span>
      `;
      el.appendChild(div);
    }
  }

  renderInventory(inventory) {
    const grid = this.refs.inventoryGrid;
    grid.innerHTML = '';
    for (let i = 0; i < inventory.size; i++) {
      const s = inventory.slots[i];
      const div = document.createElement('div');
      div.className = 'inv-slot';
      if (s) {
        div.innerHTML = `<span>${ITEMS[s.id]?.icon || '?'}</span><span>${s.count}</span>`;
      }
      grid.appendChild(div);
    }
  }

  renderCraftList(inventory, onCraft) {
    const list = this.refs.craftList;
    list.innerHTML = '';
    for (const recipe of RECIPES) {
      const can = inventory.has(recipe.cost);
      const div = document.createElement('div');
      div.className = 'craft-item' + (can ? '' : ' disabled');
      const costStr = Object.entries(recipe.cost)
        .map(([id, n]) => `${ITEMS[id]?.icon || id}×${n}`)
        .join(' ');
      div.innerHTML = `<span>${recipe.name}</span><span>${costStr}</span>`;
      if (can) div.addEventListener('click', () => onCraft(recipe));
      list.appendChild(div);
    }
  }

  renderBuildList(inventory, onSelect) {
    const list = this.refs.buildList;
    list.innerHTML = '';
    for (const b of Object.values(BUILDINGS)) {
      const kitCount = inventory.count(b.kit);
      const div = document.createElement('div');
      div.className = 'build-item' + (kitCount > 0 ? '' : ' disabled');
      div.innerHTML = `<span>${b.icon} ${b.name}</span><span>套件 ×${kitCount}</span>`;
      if (kitCount > 0) div.addEventListener('click', () => onSelect(b.id));
      list.appendChild(div);
    }
  }

  setHint(text) {
    this.refs.actionHint.textContent = text;
  }
}

function phaseLabel(p) {
  return { dawn: '清晨', day: '白天', dusk: '黄昏', night: '夜晚' }[p] || p;
}

function phaseIcon(p) {
  return { dawn: '🌅', day: '☀️', dusk: '🌇', night: '🌙' }[p] || '⏳';
}
