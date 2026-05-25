import * as THREE from 'three';
import { BUILD_DEFS } from './config.js';

const MAT = {
  wood: new THREE.MeshLambertMaterial({ color: 0x6b4423 }),
  stone: new THREE.MeshLambertMaterial({ color: 0x6c757d }),
  roof: new THREE.MeshLambertMaterial({ color: 0x4a3728 }),
  fire: new THREE.MeshBasicMaterial({ color: 0xff6622 }),
};

function makeMesh(type) {
  const g = new THREE.Group();
  const def = BUILD_DEFS[type];
  if (type === 'campfire') {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.12, 8), MAT.stone);
    const logs = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 4), MAT.wood);
    logs.rotation.z = Math.PI / 2;
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.45, 5), MAT.fire);
    flame.position.y = 0.35;
    g.add(ring, logs, flame);
    g.userData.lightColor = 0xff8844;
  } else if (type === 'wall') {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.2, 0.35), MAT.wood);
    wall.position.y = 1.1;
    g.add(wall);
  } else if (type === 'floor') {
    const floor = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 2.4), MAT.wood);
    floor.position.y = 0.06;
    g.add(floor);
  } else if (type === 'shelter') {
    const base = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.15, 3.2), MAT.wood);
    base.position.y = 0.08;
    const post1 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.4, 0.15), MAT.wood);
    post1.position.set(-1.4, 1.2, -1.4);
    const post2 = post1.clone();
    post2.position.set(1.4, 1.2, -1.4);
    const post3 = post1.clone();
    post3.position.set(-1.4, 1.2, 1.4);
    const post4 = post1.clone();
    post4.position.set(1.4, 1.2, 1.4);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1.2, 4), MAT.roof);
    roof.position.y = 2.6;
    roof.rotation.y = Math.PI / 4;
    g.add(base, post1, post2, post3, post4, roof);
  }
  g.userData.buildType = type;
  g.userData.def = def;
  return g;
}

export class BuildSystem {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.placed = [];
    this.mode = null;
    this.ghost = null;
    this.yaw = 0;
    this._tmp = new THREE.Vector3();
  }

  enter(type) {
    this.exit();
    this.mode = type;
    this.ghost = makeMesh(type);
    this.ghost.traverse((c) => {
      if (c.isMesh && c.material) {
        c.material = c.material.clone();
        c.material.transparent = true;
        c.material.opacity = 0.55;
      }
    });
    this.scene.add(this.ghost);
  }

  exit() {
    if (this.ghost) {
      this.scene.remove(this.ghost);
      this.ghost = null;
    }
    this.mode = null;
  }

  rotate() {
    this.yaw += Math.PI / 2;
  }

  update(px, py, pz, yaw, getHeightAt) {
    if (!this.ghost || !this.mode) return;
    const reach = 5;
    const x = px + Math.sin(yaw) * reach;
    const z = pz + Math.cos(yaw) * reach;
    const y = getHeightAt(x, z);
    this.ghost.position.set(x, y, z);
    this.ghost.rotation.y = this.yaw + yaw;
  }

  tryPlace(inventory) {
    if (!this.ghost || !this.mode) return false;
    const { x, z } = this.ghost.position;
    const y = this.ghost.position.y;
    const mesh = makeMesh(this.mode);
    mesh.position.set(x, y, z);
    mesh.rotation.copy(this.ghost.rotation);
    this.scene.add(mesh);

    const def = BUILD_DEFS[this.mode];
    const entry = {
      type: this.mode,
      mesh,
      x,
      y,
      z,
      hp: def.hp,
      maxHp: def.hp,
      def,
    };
    this.placed.push(entry);

    if (def.collider) {
      this.world.colliders.push({ x, z, r: def.radius });
    }
    if (this.mode === 'campfire') {
      const light = new THREE.PointLight(0xff8844, 1.2, 12);
      light.position.set(x, y + 1.2, z);
      this.scene.add(light);
      entry.light = light;
    }

    this.exit();
    return true;
  }

  getShelterHeal(px, pz) {
    for (const b of this.placed) {
      if (b.type !== 'shelter' || b.hp <= 0) continue;
      if (Math.hypot(b.x - px, b.z - pz) < b.def.radius + 0.5) {
        return b.def.healAura || 0;
      }
    }
    return 0;
  }
}
