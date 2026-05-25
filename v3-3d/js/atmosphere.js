import * as THREE from 'three';

/** 环境漂浮粒子 — 萤火虫/尘埃，增强氛围 */
export class AtmosphereFX {
  constructor(scene) {
    this.scene = scene;
    this.count = 48;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(this.count * 3);
    const phase = new Float32Array(this.count);
    for (let i = 0; i < this.count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 90;
      pos[i * 3 + 1] = 0.5 + Math.random() * 8;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 90;
      phase[i] = Math.random() * Math.PI * 2;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('phase', new THREE.BufferAttribute(phase, 1));
    this.mat = new THREE.PointsMaterial({
      color: 0xfff4a8,
      size: 0.22,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this._t = 0;
    this._night = false;
  }

  setPhase(isNight) {
    this._night = isNight;
    this.mat.color.setHex(isNight ? 0x9ad4ff : 0xfff4a8);
    this.mat.opacity = isNight ? 0.7 : 0.45;
    this.mat.size = isNight ? 0.28 : 0.2;
  }

  update(dt, px, pz) {
    this._t += dt;
    const pos = this.points.geometry.attributes.position;
    const phase = this.points.geometry.attributes.phase;
    for (let i = 0; i < this.count; i++) {
      const ph = phase.getX(i) + dt * (this._night ? 1.2 : 0.7);
      phase.setX(i, ph);
      let x = pos.getX(i) + Math.sin(ph * 1.3) * dt * 0.35;
      let y = pos.getY(i) + Math.cos(ph * 0.9) * dt * 0.25;
      let z = pos.getZ(i) + Math.sin(ph * 1.7 + i) * dt * 0.35;
      const dx = x - px;
      const dz = z - pz;
      if (dx * dx + dz * dz > 3600) {
        x = px + (Math.random() - 0.5) * 40;
        z = pz + (Math.random() - 0.5) * 40;
        y = 0.8 + Math.random() * 6;
      }
      pos.setXYZ(i, x, y, z);
    }
    pos.needsUpdate = true;
    this.points.position.set(px * 0.02, 0, pz * 0.02);
  }

  dispose() {
    this.scene.remove(this.points);
    this.points.geometry.dispose();
    this.mat.dispose();
  }
}

/** 实体脚下软阴影圆 */
export function attachGroundShadow(parent, radius = 0.9, opacity = 0.28) {
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 16),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity,
      depthWrite: false,
    })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.04;
  mesh.renderOrder = -1;
  parent.add(mesh);
  return mesh;
}
