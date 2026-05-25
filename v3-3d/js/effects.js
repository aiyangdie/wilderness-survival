import * as THREE from 'three';

const POOL_SIZE = 48;
const sharedGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
const matCache = new Map();

function getMat(color) {
  if (!matCache.has(color)) {
    matCache.set(
      color,
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false })
    );
  }
  return matCache.get(color);
}

/** 对象池粒子 — 零运行时 Geometry/Material 分配 */
export class VfxManager {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
    this.activeCount = 0;

    for (let i = 0; i < POOL_SIZE; i++) {
      const mesh = new THREE.Mesh(sharedGeo, getMat(0xffffff));
      mesh.visible = false;
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.pool.push({
        mesh,
        vel: new THREE.Vector3(),
        life: 0,
        age: 0,
        active: false,
      });
    }

    this.focusRing = new THREE.Mesh(
      new THREE.RingGeometry(0.7, 1.05, 16),
      new THREE.MeshBasicMaterial({
        color: 0x3ecf8e,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this.focusRing.rotation.x = -Math.PI / 2;
    this.focusRing.visible = false;
    this.focusRing.frustumCulled = false;
    scene.add(this.focusRing);

    this.slash = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 0.15),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this.slash.visible = false;
    this.slash.frustumCulled = false;
    scene.add(this.slash);
    this.slashTimer = 0;
    this._pulseT = 0;
    this._focusVisible = false;
  }

  _emit(x, y, z, color, count, spread, upSpeed, life) {
    let spawned = 0;
    for (const p of this.pool) {
      if (p.active) continue;
      p.active = true;
      p.age = 0;
      p.life = life + Math.random() * 0.15;
      p.mesh.material = getMat(color);
      p.mesh.visible = true;
      p.mesh.position.set(
        x + (Math.random() - 0.5) * spread,
        y + 0.8 + Math.random() * 0.4,
        z + (Math.random() - 0.5) * spread
      );
      p.vel.set(
        (Math.random() - 0.5) * spread * 2,
        upSpeed + Math.random(),
        (Math.random() - 0.5) * spread * 2
      );
      spawned += 1;
      if (spawned >= count) break;
    }
  }

  burst(x, y, z, color = 0xffaa44, count = 5) {
    this._emit(x, y, z, color, count, 0.8, 2.5, 0.35);
  }

  dust(x, y, z) {
    this._emit(x, y, z, 0x8b7355, 2, 0.25, 0.5, 0.22);
  }

  slash(x, y, z, yaw) {
    this.slash.position.set(x, y + 1.2, z);
    this.slash.rotation.set(-Math.PI / 2, 0, yaw - 0.4);
    this.slash.visible = true;
    this.slashTimer = 0.1;
  }

  setFocus(x, y, z, mode = 'neutral', visible) {
    if (!visible) {
      this.focusRing.visible = false;
      this._focusVisible = false;
      return;
    }
    const colors = { danger: 0xe85d5d, resource: 0x3ecf8e, neutral: 0xf0b429, item: 0x48cae4, catch: 0xf0b429 };
    this.focusRing.material.color.setHex(colors[mode] || colors.neutral);
    this.focusRing.position.set(x, y, z);
    this.focusRing.visible = true;
    this._focusVisible = true;
  }

  update(dt) {
    if (this._focusVisible) {
      this._pulseT += dt * 5;
      this.focusRing.material.opacity = 0.42 + Math.sin(this._pulseT) * 0.15;
    }
    if (this.slashTimer > 0) {
      this.slashTimer -= dt;
      this.slash.material.opacity = Math.max(0, this.slashTimer / 0.1) * 0.85;
      if (this.slashTimer <= 0) this.slash.visible = false;
    }

    for (const p of this.pool) {
      if (!p.active) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.active = false;
        p.mesh.visible = false;
        continue;
      }
      p.vel.y -= 9 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.material.opacity = (1 - p.age / p.life) * 0.9;
    }
  }

  clear() {
    for (const p of this.pool) {
      p.active = false;
      p.mesh.visible = false;
    }
    this.focusRing.visible = false;
    this.slash.visible = false;
  }
}
