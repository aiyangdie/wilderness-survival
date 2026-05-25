import * as THREE from 'three';
import { attachGroundShadow } from './atmosphere.js';

function std(color, rough = 0.82, metal = 0.04, emissive = 0, emI = 0) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: rough,
    metalness: metal,
    emissive,
    emissiveIntensity: emI,
  });
}

const GEO = {
  leg: new THREE.CylinderGeometry(0.05, 0.042, 0.52, 6),
  hoof: new THREE.SphereGeometry(0.06, 6, 5),
  head: new THREE.SphereGeometry(0.22, 10, 8),
  bodyCap: new THREE.CapsuleGeometry(0.32, 0.72, 6, 12),
  bodyCapSm: new THREE.CapsuleGeometry(0.2, 0.38, 6, 10),
  ear: new THREE.ConeGeometry(0.07, 0.22, 6),
  antler: new THREE.CylinderGeometry(0.018, 0.028, 0.38, 5),
  tail: new THREE.ConeGeometry(0.07, 0.28, 6),
  eye: new THREE.SphereGeometry(0.035, 6, 6),
  eyeShine: new THREE.SphereGeometry(0.012, 4, 4),
  puff: new THREE.SphereGeometry(0.12, 6, 5),
  nose: new THREE.SphereGeometry(0.04, 6, 5),
};

const MAT = {
  deer: std(0xa68a64),
  deerDark: std(0x7a5c42, 0.9),
  deerBelly: std(0xc9b08a, 0.95),
  rabbit: std(0xd4a59a),
  rabbitBelly: std(0xf5ebe6, 0.95),
  wolf: std(0x5c6670),
  wolfDark: std(0x3d4650, 0.88),
  wolfEye: std(0xffcc44, 0.3, 0.1, 0x332200, 0.2),
  shadow: std(0x1a0a28, 0.6, 0.1, 0x2d1b4e, 0.45),
  shadowCore: std(0x0d0618, 0.5, 0.15, 0x5a148c, 0.65),
  eyeDark: new THREE.MeshBasicMaterial({ color: 0x111122 }),
  eyeRed: new THREE.MeshBasicMaterial({ color: 0xff2244 }),
  eyeGlow: new THREE.MeshBasicMaterial({ color: 0xff6688, transparent: true, opacity: 0.9 }),
  nose: std(0x2d2d2d, 0.95),
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

function addEyes(head, forwardZ, y, spacing, darkOnly = false) {
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(GEO.eye, MAT.eyeDark);
    eye.position.set(sx * spacing, y, forwardZ);
    eye.scale.set(0.55, 0.7, 0.45);
    head.add(eye);
    if (!darkOnly) {
      const shine = new THREE.Mesh(GEO.eyeShine, new THREE.MeshBasicMaterial({ color: 0xffffff }));
      shine.position.set(sx * spacing - 0.015, y + 0.02, forwardZ + 0.02);
      head.add(shine);
    }
  }
}

/** 四足动物 — 情绪动作、头尾、脚下阴影 */
class QuadrupedVisual {
  constructor(group, legs, bodyMesh, opts = {}) {
    this.group = group;
    this.legs = legs;
    this.bodyMesh = bodyMesh;
    this.head = opts.head || null;
    this.tail = opts.tail || null;
    this.ears = opts.ears || null;
    this.neck = opts.neck || null;
    this.type = opts.type || '';
    this.walkPhase = Math.random() * Math.PI * 2;
    this.breathe = Math.random() * Math.PI * 2;
    this.mood = 'idle';
    this.hurtTimer = 0;
    this._faceYaw = 0;
    attachGroundShadow(group, opts.shadowR ?? 0.85, opts.shadowA ?? 0.3);
  }

  setMood(mood, hpRatio = 1) {
    this.mood = mood;
    this.hpRatio = hpRatio;
  }

  triggerHurt() {
    this.hurtTimer = 0.32;
  }

  update(dt, moving, speed = 5, opts = {}) {
    const mood = opts.mood || this.mood;
    const hpRatio = opts.hpRatio ?? this.hpRatio ?? 1;
    if (opts.faceYaw != null) this._faceYaw = opts.faceYaw;

    if (this.hurtTimer > 0) {
      this.hurtTimer -= dt;
      const t = this.hurtTimer / 0.32;
      if (this.bodyMesh) {
        this.bodyMesh.rotation.x = -0.35 * t;
        this.bodyMesh.position.x = Math.sin(t * 20) * 0.04;
      }
      if (this.head) this.head.rotation.x = -0.2 * t;
    }

    this.breathe += dt * (mood === 'flee' ? 2.4 : 1.5);
    const breath = Math.sin(this.breathe) * (mood === 'idle' ? 0.014 : 0.008);
    if (this.bodyMesh && this.hurtTimer <= 0) {
      const baseY = this.bodyMesh.userData.baseY ?? this.bodyMesh.position.y;
      this.bodyMesh.userData.baseY = baseY;
      this.bodyMesh.position.y = baseY + breath;
    }

    if (this.head) {
      const look = THREE.MathUtils.lerp(this.head.rotation.y, this._faceYaw, dt * 6);
      this.head.rotation.y = look;
      if (mood === 'flee') {
        this.head.rotation.x = THREE.MathUtils.lerp(this.head.rotation.x, -0.25, dt * 5);
      } else if (mood === 'hunt') {
        this.head.rotation.x = THREE.MathUtils.lerp(this.head.rotation.x, 0.35, dt * 5);
      } else {
        this.head.rotation.x = THREE.MathUtils.lerp(this.head.rotation.x, breath * 2, dt * 4);
      }
    }

    if (this.ears && mood === 'flee') {
      this.ears.rotation.x = THREE.MathUtils.lerp(this.ears.rotation.x, -0.35, dt * 8);
    } else if (this.ears) {
      this.ears.rotation.x = THREE.MathUtils.lerp(this.ears.rotation.x, 0, dt * 5);
    }

    if (this.tail) {
      this.tail.rotation.y += dt * (moving ? speed * 0.08 : 0.4);
      if (mood === 'flee') this.tail.rotation.x = 0.9;
      else if (mood === 'hunt') this.tail.rotation.x = 0.4;
      else this.tail.rotation.x = THREE.MathUtils.lerp(this.tail.rotation.x, 0.55, dt * 3);
    }

    if (this.neck && mood === 'hunt') {
      this.neck.rotation.x = THREE.MathUtils.lerp(this.neck.rotation.x, -0.65, dt * 4);
    } else if (this.neck) {
      this.neck.rotation.x = THREE.MathUtils.lerp(this.neck.rotation.x, -0.45, dt * 4);
    }

    if (hpRatio < 0.45 && this.bodyMesh?.material?.emissive) {
      this.bodyMesh.material.emissive.setHex(0x331111);
      this.bodyMesh.material.emissiveIntensity = 0.15 * (1 - hpRatio);
    }

    if (!moving || !this.legs.length) {
      this.legs.forEach((l) => { l.rotation.x = THREE.MathUtils.lerp(l.rotation.x, 0, dt * 8); });
      return;
    }

    const rate = mood === 'flee' ? speed * 1.35 : speed * 1.1;
    this.walkPhase += dt * rate;
    const amp = mood === 'flee' ? 0.68 : mood === 'hunt' ? 0.62 : 0.52;
    const s = Math.sin(this.walkPhase) * amp;
    const c = Math.cos(this.walkPhase) * amp;
    if (this.legs.length >= 4) {
      this.legs[0].rotation.x = s;
      this.legs[1].rotation.x = -s;
      this.legs[2].rotation.x = -c;
      this.legs[3].rotation.x = c;
    }
    if (mood === 'hunt' && this.bodyMesh) {
      this.bodyMesh.rotation.x = 0.12 + breath;
    }
  }

  setVisible(v) { this.group.visible = v; }
  dispose() { this.group.parent?.remove(this.group); }
}

function buildDeer() {
  const group = new THREE.Group();
  const head = new THREE.Group();
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

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.38, 6), MAT.deer);
  neck.position.set(0, 0.82, 0.42);
  neck.rotation.x = -0.45;
  group.add(neck);

  head.position.set(0, 0.95, 0.58);
  const headMesh = new THREE.Mesh(GEO.head, MAT.deer);
  headMesh.scale.set(1.1, 1, 1.25);
  head.add(headMesh);

  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.22), MAT.deerDark);
  snout.position.set(0, -0.08, 0.16);
  head.add(snout);
  addEyes(head, 0.2, 0.02, 0.07);

  const nose = new THREE.Mesh(GEO.nose, MAT.nose);
  nose.position.set(0, -0.1, 0.28);
  nose.scale.set(0.7, 0.6, 0.7);
  head.add(nose);

  group.add(head);

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

  const ears = new THREE.Group();
  ears.position.set(0, 1.05, 0.52);
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(GEO.ear, MAT.deerDark);
    ear.position.set(sx * 0.14, 0, 0);
    ear.rotation.z = sx * -0.5;
    ears.add(ear);
  }
  group.add(ears);

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

  group.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return new QuadrupedVisual(group, legs, body, {
    head, tail, ears, neck, type: 'deer', shadowR: 1.0,
  });
}

function buildRabbit() {
  const group = new THREE.Group();
  const head = new THREE.Group();
  const body = new THREE.Mesh(GEO.bodyCapSm, MAT.rabbit);
  body.rotation.z = Math.PI / 2;
  body.position.set(0, 0.38, 0);
  body.scale.set(1.1, 1, 1.25);
  group.add(body);

  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), MAT.rabbitBelly);
  belly.position.set(0, 0.32, 0.06);
  belly.scale.set(1.1, 0.85, 1.2);
  group.add(belly);

  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 7), MAT.rabbit);
  headMesh.position.set(0, 0.48, 0.22);
  head.add(headMesh);
  addEyes(head, 0.12, 0.02, 0.05);

  const nose = new THREE.Mesh(GEO.nose, MAT.nose);
  nose.position.set(0, -0.02, 0.14);
  nose.scale.set(0.55, 0.45, 0.55);
  head.add(nose);
  group.add(head);

  const ears = new THREE.Group();
  ears.position.set(0, 0.58, 0.18);
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.32, 4, 6), MAT.rabbit);
    ear.position.set(sx * 0.07, 0.2, 0);
    ear.rotation.z = sx * 0.12;
    ears.add(ear);
  }
  group.add(ears);

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

  const visual = new QuadrupedVisual(group, legs, body, {
    head, tail, ears, type: 'rabbit', shadowR: 0.55,
  });
  visual.hopPhase = Math.random() * Math.PI * 2;

  const baseUpdate = visual.update.bind(visual);
  visual.update = (dt, moving, speed, opts) => {
    visual.hopPhase += dt * (moving ? speed * 1.5 : 1.1);
    if (moving) {
      const hopMul = opts?.mood === 'flee' ? 1.25 : 1;
      const hop = Math.abs(Math.sin(visual.hopPhase)) * 0.16 * hopMul;
      body.position.y = 0.38 + hop;
      ears.rotation.z = Math.sin(visual.hopPhase * 2) * 0.06;
    }
    baseUpdate(dt, moving, speed, opts);
  };
  return visual;
}

function buildWolf() {
  const group = new THREE.Group();
  const head = new THREE.Group();
  const body = new THREE.Mesh(GEO.bodyCap, MAT.wolf);
  body.rotation.z = Math.PI / 2;
  body.position.set(0, 0.58, 0);
  body.scale.set(1.05, 0.95, 1.45);
  group.add(body);

  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), MAT.wolfDark);
  chest.position.set(0, 0.62, 0.18);
  chest.scale.set(1.1, 0.9, 1);
  group.add(chest);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.32, 6), MAT.wolfDark);
  neck.position.set(0, 0.72, 0.38);
  neck.rotation.x = -0.45;
  group.add(neck);

  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), MAT.wolf);
  headMesh.scale.set(1.15, 1, 1.35);
  headMesh.position.set(0, 0.78, 0.52);
  head.add(headMesh);

  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.11, 0.28), MAT.wolfDark);
  snout.position.set(0, -0.06, 0.22);
  head.add(snout);

  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(GEO.eye, MAT.wolfEye);
    eye.position.set(sx * 0.08, 0.04, 0.24);
    eye.scale.set(0.5, 0.55, 0.4);
    head.add(eye);
  }

  group.add(head);

  const ears = new THREE.Group();
  ears.position.set(0, 0.95, 0.48);
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(GEO.ear, MAT.wolfDark);
    ear.position.set(sx * 0.12, 0, 0);
    ear.rotation.z = sx * -0.35;
    ear.rotation.x = -0.15;
    ears.add(ear);
  }
  group.add(ears);

  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.48, 6), MAT.wolfDark);
  tail.position.set(0, 0.68, -0.58);
  tail.rotation.x = 0.85;
  group.add(tail);

  const legs = [
    addLeg(group, -0.2, 0.3, MAT.wolfDark, 1.05),
    addLeg(group, 0.2, 0.3, MAT.wolfDark, 1.05),
    addLeg(group, -0.2, -0.3, MAT.wolfDark, 1.05),
    addLeg(group, 0.2, -0.3, MAT.wolfDark, 1.05),
  ];

  return new QuadrupedVisual(group, legs, body, {
    head, tail, ears, neck, type: 'wolf', shadowR: 1.05,
  });
}

function buildShadow() {
  const group = new THREE.Group();
  attachGroundShadow(group, 1.2, 0.45);

  const aura = new THREE.Mesh(
    new THREE.RingGeometry(0.5, 1.1, 24),
    new THREE.MeshBasicMaterial({
      color: 0x9933ff,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  aura.rotation.x = -Math.PI / 2;
  aura.position.y = 0.06;
  group.add(aura);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 0.95, 6, 12), MAT.shadow);
  torso.position.y = 1.05;
  group.add(torso);

  const head = new THREE.Group();
  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), MAT.shadowCore);
  headMesh.scale.set(0.95, 1.05, 0.9);
  headMesh.position.set(0, 1.72, 0.05);
  head.add(headMesh);

  const hood = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.55, 8), MAT.shadow);
  hood.position.set(0, 0.23, -0.02);
  hood.rotation.x = -0.15;
  head.add(hood);

  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(GEO.eye, MAT.eyeRed);
    eye.position.set(sx * 0.09, 0.02, 0.15);
    head.add(eye);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), MAT.eyeGlow);
    glow.position.set(sx * 0.09, 0.02, 0.17);
    head.add(glow);
  }
  group.add(head);

  const arms = [];
  const armGeo = new THREE.CapsuleGeometry(0.09, 0.55, 4, 8);
  for (const sx of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(sx * 0.42, 1.25, 0);
    const upper = new THREE.Mesh(armGeo, MAT.shadow);
    upper.rotation.z = sx * 0.35;
    upper.position.y = -0.2;
    arm.add(upper);
    arm.userData.side = sx;
    group.add(arm);
    arms.push(arm);
  }

  const cloak = new THREE.Mesh(
    new THREE.ConeGeometry(0.68, 1.15, 8, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0x120820,
      emissive: 0x4a0088,
      emissiveIntensity: 0.4,
      transparent: true,
      opacity: 0.78,
      side: THREE.DoubleSide,
      roughness: 0.4,
      metalness: 0.1,
    })
  );
  cloak.position.y = 0.55;
  group.add(cloak);

  return {
    group,
    torso,
    head,
    aura,
    arms,
    floatPhase: Math.random() * Math.PI * 2,
    hurtTimer: 0,
    triggerHurt() { this.hurtTimer = 0.35; },
    update(dt, moving, speed = 6, opts = {}) {
      const mood = opts.mood || (moving ? 'hunt' : 'idle');
      if (this.hurtTimer > 0) {
        this.hurtTimer -= dt;
        torso.rotation.x = -0.3 * (this.hurtTimer / 0.35);
      }
      this.floatPhase += dt * (moving ? 3.2 : 1.5);
      const floatY = Math.sin(this.floatPhase) * (moving ? 0.08 : 0.04);
      torso.position.y = 1.05 + floatY;
      head.position.y = floatY;
      aura.material.opacity = 0.28 + Math.sin(this.floatPhase * 2) * 0.12;
      aura.rotation.z += dt * 0.6;
      this.arms.forEach((c) => {
        c.rotation.x = Math.sin(this.floatPhase * 1.5) * 0.3 * c.userData.side;
        if (mood === 'hunt') c.rotation.x -= 0.4 * c.userData.side;
      });
      if (moving) {
        torso.rotation.y = Math.sin(this.floatPhase * 0.8) * 0.08;
        cloak.rotation.y += dt * 0.5;
      }
      if (opts.faceYaw != null) {
        head.rotation.y = THREE.MathUtils.lerp(head.rotation.y, opts.faceYaw, dt * 5);
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
