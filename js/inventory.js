import { ITEMS } from './config.js';

export class Inventory {
  constructor(size = 20) {
    this.size = size;
    this.slots = Array.from({ length: size }, () => null);
    this.hotbarSize = 5;
  }

  add(itemId, count = 1) {
    const def = ITEMS[itemId];
    if (!def) return 0;
    let left = count;

    for (let i = 0; i < this.slots.length && left > 0; i++) {
      const s = this.slots[i];
      if (s && s.id === itemId && s.count < def.stack) {
        const room = def.stack - s.count;
        const add = Math.min(room, left);
        s.count += add;
        left -= add;
      }
    }

    for (let i = 0; i < this.slots.length && left > 0; i++) {
      if (!this.slots[i]) {
        const add = Math.min(def.stack, left);
        this.slots[i] = { id: itemId, count: add };
        left -= add;
      }
    }

    return count - left;
  }

  remove(itemId, count = 1) {
    let need = count;
    for (let i = this.slots.length - 1; i >= 0 && need > 0; i--) {
      const s = this.slots[i];
      if (s && s.id === itemId) {
        const take = Math.min(s.count, need);
        s.count -= take;
        need -= take;
        if (s.count <= 0) this.slots[i] = null;
      }
    }
    return need === 0;
  }

  count(itemId) {
    return this.slots.reduce((n, s) => (s && s.id === itemId ? n + s.count : n), 0);
  }

  has(cost) {
    return Object.entries(cost).every(([id, n]) => this.count(id) >= n);
  }

  consume(cost) {
    if (!this.has(cost)) return false;
    for (const [id, n] of Object.entries(cost)) this.remove(id, n);
    return true;
  }

  getHotbarSlot(index) {
    return this.slots[index] ?? null;
  }

  getActiveTool(hotbarIndex) {
    const slot = this.getHotbarSlot(hotbarIndex);
    if (!slot) return null;
    const def = ITEMS[slot.id];
    return def?.tool ? slot.id : null;
  }
}
