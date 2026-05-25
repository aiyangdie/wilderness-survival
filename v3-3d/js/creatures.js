import * as THREE from 'three';

/** 共享几何体/材质，减少内存与 draw call */
const GEO = {
  leg: new THREE.CylinderGeometry(0.05, 0.04, 0.52, 5),
  hoof: new THREE.SphereGeometry(0.06, 4, 4),
  head: new THREE.SphereGeometry(0.22, 6, 6),
  bodyCap: new THREE.CapsuleGeometry(0.32, 0.72, 4, 8),
  bodyCapSm: new THREE.CapsuleGeometry(0.2, 0.38, 4, 6),
  ear: new THREE.ConeGeometry(0.07, 0.22, 4),
  antler: new THREE.CylinderGeometry(0.018, 0.028, 0.38, 4),
  tail: new THREE.ConeGeometry(0.07, 0.28, 4),
  eye: new THREE.SphereGeometry(0.035, 4, 4),
  puff: new THREE.SphereGeometry(0.12, 5, 5),
};

const MAT = {
  deer: new THREE.MeshLambertMaterial({ color: 0xa68a64 }),
  deerDark: new THREE.MeshLambertMaterial({ color: 0x7a5c42 }),
  deerBelly: new THREE.MeshLambertMaterial({ color: 0xc9b08a }),
  rabbit: new THREE.MeshLambertMaterial({ color: 0xd4a59a }),
  rabbitBelly: new THREE.MeshLambertMaterial({ color: 0xf0ddd8 }),
  wolf: new THREE.MeshLambertMaterial({ color: 0x5c6670 }),
  wolfDark: new THREE.MeshLambertMaterial({ color: 0x3d4650 }),
  shadow: new THREE.MeshLambertMaterial({ color: 0x1a0a28, emissive: 0x2d1b4e, emissiveIntensity: 0.35 }),
  shadowCore: new THREE.MeshLambertMaterial({ color: 0x0d0618, emissive: 0x4a148c, emissiveIntensity: 0.5 }),
  eyeRed: new THREE.MeshBasicMaterial({ color: 0xff2244 }),
  eyeGlow: new THREE.MeshBasicMaterial({ color: 0xff6688, transparent: true, opacity: 0.85 }),
  nose: new THREE.MeshLambertMaterial({ color: 0x2d2d2d }),
};

function addLeg(parent, x, z, mat, scale = 1) {
  const pivot = new THREE.Group();
  pivot.position.set(x, 0.26, z);
  const leg = new THREE.Mesh(GEO.leg, mat);
  leg.position.y = -0.26;
  leg.scale.setScalar(scale);
  const hoof = new THREE.Mesh(GEO.hoof, mat);
  hoof.position.y = -0.52;
  hoof.scale.setScalar(scale);
  pivot.add(leg, hoof);
  parent.add(pivot);
  return pivot;
}

/** 四足动物基类 — 共享行走动画 */
class QuadrupedVisual {
  constructor(group, legs, bodyMesh) {
    this.group = group;
    this.legs = legs;
    this.bodyMesh = bodyMesh;
    this.walkPhase = 0;
    this.breathe = Math.random() * Math.PI * 2;
  }

  update(dt, moving, speed = 5) {
    this.breathe += dt * 1.6;
    const breath = Math.sin(this.breathe) * 0.012;
    if (this.bodyMesh) {
      this.bodyMesh.position.y = 0.62 + breath;
      this.bodyMesh.rotation.x = breath * 0.4;
    }
    if (!moving || !this.legs.length) {
      this.legs.forEach((l) => { l.rotation.x = THREE.MathUtils.lerp(l.rotation.x, 0, dt * 8); });
      return;
    }
    this.walkPhase += dt * speed * 1.15;
    const s = Math.sin(this.walkPhase) * 0.55;
    const c = Math.cos(this.walkPhase) * 0.55;
    if (this.legs.length >= 4) {
      this.legs[0].rotation.x = s;
      this.legs[1].rotation.x = -s;
      this.legs[2].rotation.x = -c;
      this.legs[3].rotation.x = c;
    }
  }

  setVisible(v) {
    this.group.visible = v;
  }

  dispose() {
    this.group.parent?.remove(this.group);
  }
}

function buildDeer() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(GEO.bodyCap, MAT.deer);
  body.rotation.z = Math.PI / 2;
  body.position.set(0, 0.62, 0);
  body.scale.set(1.15, 1, 1.35);
  group.add(body);

  const belly = new THREE.Mesh(GEO.bodyCapSm, MAT.deerBelly);
  belly.rotation.z = Math.PI / 2;
  belly.position.set(0, 0.52, 0.08);
  belly.scale.set(0.95, 0.85, 1.1);
  group.add(belly);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.38, 5), MAT.deer);
  neck.position.set(0, 0.82, 0.42);
  neck.rotation.x = -0.45;
  group.add(neck);

  const head = new THREE.Mesh(GEO.head, MAT.deer);
  head.scale.set(1.1, 1, 1.25);
  head.position.set(0, 0.98, 0.62);
  group.add(head);

  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.22), MAT.deerDark);
  snout.position.set(0, 0.9, 0.78);
  group.add(snout);

  for (const sx of [-1, 1]) {
    const antler = new THREE.Group();
    antler.position.set(sx * 0.1, 1.12, 0.58);
    const main = new THREE.Mesh(GEO.antler, MAT.deerDark);
    main.rotation.z = sx * 0.35;
    main.rotation.x = -0.2;
    const branch = new THREE.Mesh(GEO.antler, MAT.deerDark);
    branch.scale.set(0.7, 0.55, 0.7);
    branch.position.set(sx * 0.08, 0.18, 0);
    branch.rotation.z = sx * 0.9;
    antler.add(main, branch);
    group.add(antler);
  }

  const earL = new THREE.Mesh(GEO.ear, MAT.deerDark);
  earL.position.set(-0.14, 1.05, 0.52);
  earL.rotation.z = -0.5;
  const earR = earL.clone();
  earR.position.x = 0.14;
  earR.rotation.z = 0.5;
  group.add(earL, earR);

  const tail = new THREE.Mesh(GEO.tail, MAT.deerDark);
  tail.position.set(0, 0.72, -0.52);
  tail.rotation.x = 0.6;
  group.add(tail);

  const legs = [
    addLeg(group, -0.22, 0.28, MAT.deerDark),
    addLeg(group, 0.22, 0.28, MAT.deerDark),
    addLeg(group, -0.22, -0.28, MAT.deerDark),
    addLeg(group, 0.22, -0.28, MAT.deerDark),
  ];

  group.traverse((o) => { if (o.isMesh) o.frustumCulled = true; });
  return new QuadrupedVisual(group, legs, body);
}

function buildRabbit() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(GEO.bodyCapSm, MAT.rabbit);
  body.rotation.z = Math.PI / 2;
  body.position.set(0, 0.38, 0);
  body.scale.set(1.1, 1, 1.25);
  group.add(body);

  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.22, 5, 5), MAT.rabbitBelly);
  belly.position.set(0, 0.32, 0.06);
  belly.scale.set(1.1, 0.85, 1.2);
  group.add(belly);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 6), MAT.rabbit);
  head.position.set(0, 0.48, 0.22);
  group.add(head);

  const ears = new THREE.Group();
  ears.position.set(0, 0.58, 0.18);
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.28, 3, 4), MAT.rabbit);
    ear.position.set(sx * 0.07, 0.18, 0);
    ear.rotation.z = sx * 0.12;
    ears.add(ear);
  }
  group.add(ears);

  const nose = new THREE.Mesh(GEO.nose, MAT.nose);
  nose.position.set(0, 0.44, 0.34);
  nose.scale.set(0.6, 0.5, 0.6);
  group.add(nose);

  const tail = new THREE.Mesh(GEO.puff, MAT.rabbitBelly);
  tail.position.set(0, 0.36, -0.22);
  tail.scale.set(0.55, 0.55, 0.55);
  group.add(tail);

  const legs = [
    addLeg(group, -0.1, 0.12, MAT.rabbit, 0.65),
    addLeg(group, 0.1, 0.12, MAT.rabbit, 0.65),
    addLeg(group, -0.1, -0.12, MAT.rabbit, 0.65),
    addLeg(group, 0.1, -0.12, MAT.rabbit, 0.65),
  ];

  const visual = new QuadrupedVisual(group, legs, body);
  visual.ears = ears;
  visual.hopPhase = Math.random() * Math.PI * 2;

  const baseUpdate = visual.update.bind(visual);
  visual.update = (dt, moving, speed) => {
    visual.hopPhase += dt * (moving ? speed * 1.4 : 1.2);
    if (moving) {
      const hop = Math.abs(Math.sin(visual.hopPhase)) * 0.14;
      body.position.y = 0.38 + hop;
      ears.rotation.x = Math.sin(visual.hopPhase * 2) * 0.08;
    }
    baseUpdate(dt, moving, speed);
  };

  group.traverse((o) => { if (o.isMesh) o.frustumCulled = true; });
  return visual;
}

function buildWolf() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(GEO.bodyCap, MAT.wolf);
  body.rotation.z = Math.PI / 2;
  body.position.set(0, 0.58, 0);
  body.scale.set(1.05, 0.95, 1.45);
  group.add(body);

  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.28, 5, 5), MAT.wolfDark);
  chest.position.set(0, 0.62, 0.18);
  chest.scale.set(1.1, 0.9, 1);
  group.add(chest);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 6), MAT.wolf);
  head.scale.set(1.15, 1, 1.35);
  head.position.set(0, 0.78, 0.52);
  group.add(head);

  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.11, 0.26), MAT.wolfDark);
  snout.position.set(0, 0.7, 0.72);
  group.add(snout);

  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(GEO.ear, MAT.wolfDark);
    ear.position.set(sx * 0.12, 0.95, 0.48);
    ear.rotation.z = sx * -0.35;
    ear.rotation.x = -0.15;
    group.add(ear);
  }

  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.45, 5), MAT.wolfDark);
  tail.position.set(0, 0.68, -0.58);
  tail.rotation.x = 0.85;
  group.add(tail);

  const legs = [
    addLeg(group, -0.2, 0.3, MAT.wolfDark, 1.05),
    addLeg(group, 0.2, 0.3, MAT.wolfDark, 1.05),
    addLeg(group, -0.2, -0.3, MAT.wolfDark, 1.05),
    addLeg(group, 0.2, -0.3, MAT.wolfDark, 1.05),
  ];

  group.traverse((o) => { if (o.isMesh) o.frustumCulled = true; });
  return new QuadrupedVisual(group, legs, body);
}

function buildShadow() {
  const group = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 0.95, 4, 6), MAT.shadow);
  torso.position.y = 1.05;
  group.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 6, 6), MAT.shadowCore);
  head.position.set(0, 1.72, 0.05);
  head.scale.set(0.95, 1.05, 0.9);
  group.add(head);

  const hood = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.55, 5), MAT.shadow);
  hood.position.set(0, 1.95, -0.02);
  hood.rotation.x = -0.15;
  group.add(hood);

  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(GEO.eye, MAT.eyeRed);
    eye.position.set(sx * 0.09, 1.74, 0.2);
    group.add(eye);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.06, 4, 4), MAT.eyeGlow);
    glow.position.copy(eye.position);
    glow.position.z += 0.02;
    group.add(glow);
  }

  const armGeo = new THREE.CapsuleGeometry(0.09, 0.55, 3, 5);
  for (const sx of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(sx * 0.42, 1.25, 0);
    const upper = new THREE.Mesh(armGeo, MAT.shadow);
    upper.rotation.z = sx * 0.35;
    upper.position.y = -0.2;
    arm.add(upper);
    group.add(arm);
    arm.userData.side = sx;
  }

  const cloak = new THREE.Mesh(
    new THREE.ConeGeometry(0.65, 1.1, 6, 1, true),
    new THREE.MeshLambertMaterial({
      color: 0x120820,
      emissive: 0x3d0066,
      emissiveIntensity: 0.25,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
    })
  );
  cloak.position.y = 0.55;
  group.add(cloak);

  group.traverse((o) => { if (o.isMesh) o.frustumCulled = true; });

  return {
    group,
    floatPhase: Math.random() * Math.PI * 2,
    update(dt, moving, speed = 6) {
      this.floatPhase += dt * (moving ? 2.8 : 1.4);
      const floatY = Math.sin(this.floatPhase) * (moving ? 0.06 : 0.03);
      torso.position.y = 1.05 + floatY;
      head.position.y = 1.72 + floatY;
      group.children.forEach((c) => {
        if (c.userData?.side) {
          c.rotation.x = Math.sin(this.floatPhase * 1.5) * 0.25 * c.userData.side;
        }
      });
      if (moving) {
        torso.rotation.y = Math.sin(this.floatPhase * 0.8) * 0.05;
      }
    },
    setVisible(v) { this.group.visible = v; },
    dispose() { this.group.parent?.remove(this.group); },
  };
}

const BUILDERS = {
  deer: buildDeer,
  rabbit: buildRabbit,
  wolf: buildWolf,
  shadow: buildShadow,
};

export function createCreatureVisual(type) {
  const fn = BUILDERS[type];
  if (!fn) return null;
  const visual = fn();
  visual.group.userData.creatureType = type;
  return visual;
}
