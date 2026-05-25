import * as THREE from 'three';

/** 轻量粒子与场景特效 */
export class VfxManager {
  constructor(scene) {
    this.scene = scene;
    this.particles = [];
    this.focusRing = new THREE.Mesh(
      new THREE.RingGeometry(0.7, 1.05, 32),
      new THREE.MeshBasicMaterial({
        color: 0x3ecf8e,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this.focusRing.rotation.x = -Math.PI / 2;
    this.focusRing.visible = false;
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
    scene.add(this.slash);
    this.slashTimer = 0;
  }

  burst(x, y, z, color = 0xffaa44, count = 10) {
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.12, 0.12),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 })
      );
      mesh.position.set(x, y + 1, z);
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 4,
        Math.random() * 3 + 1,
        (Math.random() - 0.5) * 4
      );
      this.scene.add(mesh);
      this.particles.push({ mesh, vel, life: 0.35 + Math.random() * 0.2, age: 0 });
    }
  }

  dust(x, y, z) {
    for (let i = 0; i < 3; i++) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.04, 0.08),
        new THREE.MeshBasicMaterial({ color: 0x8b7355, transparent: true, opacity: 0.5 })
      );
      mesh.position.set(x + (Math.random() - 0.5) * 0.3, y + 0.1, z + (Math.random() - 0.5) * 0.3);
      const vel = new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.4, (Math.random() - 0.5) * 0.5);
      this.scene.add(mesh);
      this.particles.push({ mesh, vel, life: 0.25, age: 0 });
    }
  }

  slash(x, y, z, yaw) {
    this.slash.position.set(x, y + 1.2, z);
    this.slash.rotation.set(-Math.PI / 2, 0, yaw - 0.4);
    this.slash.visible = true;
    this.slashTimer = 0.12;
  }

  setFocus(x, y, z, mode = 'neutral', visible) {
    if (!visible) {
      this.focusRing.visible = false;
      return;
    }
    const colors = { danger: 0xe85d5d, resource: 0x3ecf8e, neutral: 0xf0b429, item: 0x48cae4 };
    this.focusRing.material.color.setHex(colors[mode] || colors.neutral);
    this.focusRing.position.set(x, y + 0.15, z);
    this.focusRing.visible = true;
    this.focusRing.material.opacity = 0.45 + Math.sin(performance.now() * 0.008) * 0.2;
  }

  update(dt) {
    if (this.slashTimer > 0) {
      this.slashTimer -= dt;
      this.slash.material.opacity = Math.max(0, this.slashTimer / 0.12);
      if (this.slashTimer <= 0) this.slash.visible = false;
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += dt;
      p.vel.y -= 9 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.material.opacity = 1 - p.age / p.life;
      p.mesh.rotation.y += dt * 4;
      if (p.age >= p.life) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        this.particles.splice(i, 1);
      }
    }
  }

  clear() {
    this.particles.forEach((p) => {
      this.scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
    });
    this.particles = [];
    this.focusRing.visible = false;
    this.slash.visible = false;
  }
}
