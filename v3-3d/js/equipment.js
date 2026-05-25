import * as THREE from 'three';
import { ITEMS } from './config.js';

const TOOL_MESH = {
  stone_axe: () => {
    const g = new THREE.Group();
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.5, 4),
      new THREE.MeshLambertMaterial({ color: 0x5c4033 })
    );
    handle.rotation.z = Math.PI / 2;
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.1, 0.06),
      new THREE.MeshLambertMaterial({ color: 0x6c757d })
    );
    head.position.set(0.22, 0, 0);
    g.add(handle, head);
    return g;
  },
  wooden_spear: () => {
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.03, 1.1, 4),
      new THREE.MeshLambertMaterial({ color: 0x8b6914 })
    );
    shaft.rotation.z = -Math.PI / 2;
    shaft.position.x = 0.35;
    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(0.06, 0.2, 4),
      new THREE.MeshLambertMaterial({ color: 0x888 })
    );
    tip.rotation.z = -Math.PI / 2;
    tip.position.set(0.92, 0, 0);
    g.add(shaft, tip);
    return g;
  },
  wooden_bow: () => {
    const g = new THREE.Group();
    const bow = new THREE.Mesh(
      new THREE.TorusGeometry(0.22, 0.02, 4, 8, Math.PI),
      new THREE.MeshLambertMaterial({ color: 0x6b4423 })
    );
    bow.rotation.y = Math.PI / 2;
    g.add(bow);
    return g;
  },
  leather_armor: () => {
    const g = new THREE.Group();
    const vest = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.55, 0.28),
      new THREE.MeshLambertMaterial({ color: 0x8b6914 })
    );
    vest.position.y = 1.05;
    g.add(vest);
    return g;
  },
  backpack: () => {
    const g = new THREE.Group();
    const pack = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.42, 0.18),
      new THREE.MeshLambertMaterial({ color: 0x4a5568 })
    );
    pack.position.set(0, 1.05, -0.22);
    g.add(pack);
    return g;
  },
};

export class EquipmentManager {
  constructor(human) {
    this.human = human;
    this.slots = { weapon: null, armor: null, accessory: null };
    this.meshes = { weapon: null, armor: null, accessory: null };
    this.socket = new THREE.Group();
    this.socket.position.set(0.42, 1.05, 0.15);
    this.socket.rotation.y = -0.4;
    human.group.add(this.socket);
  }

  getStats() {
    let attackBonus = 0;
    let rangeBonus = 0;
    let interactBonus = 0;
    let damageReduce = 0;
    for (const id of Object.values(this.slots)) {
      if (!id) continue;
      const def = ITEMS[id];
      if (!def) continue;
      attackBonus += def.attackBonus || 0;
      rangeBonus += def.rangeBonus || 0;
      interactBonus += def.interactBonus || 0;
      damageReduce += def.damageReduce || 0;
    }
    return {
      attackBonus,
      rangeBonus,
      interactBonus,
      damageReduce: Math.min(0.45, damageReduce),
    };
  }

  equip(itemId) {
    const def = ITEMS[itemId];
    if (!def?.slot) return false;
    this.unequip(def.slot);
    this.slots[def.slot] = itemId;
    this._attachVisual(def.slot, itemId);
    return true;
  }

  unequip(slot) {
    const mesh = this.meshes[slot];
    if (mesh) {
      if (slot === 'weapon') this.socket.remove(mesh);
      else this.human.group.remove(mesh);
      mesh.traverse((c) => {
        if (c.geometry && !c.geometry.userData?.shared) c.geometry.dispose();
      });
      this.meshes[slot] = null;
    }
    this.slots[slot] = null;
  }

  _attachVisual(slot, itemId) {
    const fn = TOOL_MESH[itemId];
    if (!fn) return;
    const mesh = fn();
    mesh.traverse((o) => { if (o.isMesh) o.frustumCulled = true; });
    if (slot === 'weapon') {
      this.socket.add(mesh);
      this.meshes.weapon = mesh;
    } else {
      this.human.group.add(mesh);
      this.meshes[slot] = mesh;
    }
  }

  applyAttackPose(t) {
    const w = this.meshes.weapon;
    if (!w) return;
    w.rotation.x = -1.4 * Math.sin(t * Math.PI);
    w.rotation.z = 0.15 * Math.sin(t * Math.PI);
  }

  resetPose() {
    const w = this.meshes.weapon;
    if (w) w.rotation.set(0, 0, 0);
  }
}
