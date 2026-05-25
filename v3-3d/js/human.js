import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinnedScene } from 'three/addons/utils/SkeletonUtils.js';

const MODEL_URL = 'https://threejs.org/examples/models/gltf/Soldier.glb';
const LOAD_TIMEOUT_MS = 15000;

const CLIPS = { idle: 'Idle', walk: 'Walk', run: 'Run' };
const WALK_REF = 7.5;
const RUN_REF = 13;

let _preloadPromise = null;

export function preloadCharacter() {
  if (!_preloadPromise) {
    const loader = new GLTFLoader().loadAsync(MODEL_URL);
    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('角色模型加载超时')), LOAD_TIMEOUT_MS);
    });
    _preloadPromise = Promise.race([loader, timeout])
      .catch((err) => {
        _preloadPromise = null;
        throw err;
      });
  }
  return _preloadPromise;
}

function findBone(map, ...keys) {
  for (const k of keys) {
    if (map[k]) return map[k];
    const hit = Object.entries(map).find(([n]) => n.toLowerCase().includes(k.toLowerCase()));
    if (hit) return hit[1];
  }
  return null;
}

class ProceduralHuman {
  constructor() {
    this.group = new THREE.Group();
    this.parts = {};
    this.walkPhase = 0;
    this.breathe = 0;
    this.landTimer = 0;
    this.attackTimer = 0;
    this.interactTimer = 0;
    const skin = new THREE.MeshLambertMaterial({ color: 0xe8b4a0 });
    const shirt = new THREE.MeshLambertMaterial({ color: 0x4a5568 });
    const pants = new THREE.MeshLambertMaterial({ color: 0x2d3748 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.65, 0.26), shirt);
    torso.position.y = 1.1;
    this.group.add(torso);
    this.parts.torso = torso;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), skin);
    head.position.y = 1.55;
    this.group.add(head);
    this.parts.head = head;
    this.parts.leftLeg = this._limb(pants, -0.12, 0.5);
    this.parts.rightLeg = this._limb(pants, 0.12, 0.5);
    this.parts.leftArm = this._limb(skin, -0.34, 1.15);
    this.parts.rightArm = this._limb(skin, 0.34, 1.15);
  }

  _limb(mat, x, py) {
    const p = new THREE.Group();
    p.position.set(x, py, 0);
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.45, 0.1), mat);
    m.position.y = -0.22;
    p.add(m);
    this.group.add(p);
    return p;
  }

  triggerLand() {
    this.landTimer = 0.28;
  }

  triggerInteract() {
    this.interactTimer = 0.38;
  }

  triggerAttack() {
    this.attackTimer = 0.48;
  }

  update(dt, state) {
    const { speed, onGround, vy, sprinting, weaponId } = state;
    const inAir = !onGround;

    if (this.attackTimer > 0) {
      this.attackTimer -= dt;
      const t = 1 - this.attackTimer / 0.48;
      this._poseAttack(t, weaponId);
      return;
    }
    if (this.interactTimer > 0) {
      this.interactTimer -= dt;
      const t = 1 - this.interactTimer / 0.38;
      this._poseInteract(t);
      return;
    }

    this.breathe += dt;
    const breath = Math.sin(this.breathe * 2.2) * 0.025;
    this.parts.torso.scale.y = 1 + breath;
    this.parts.head.position.y = 1.55 + breath * 0.4;

    if (this.landTimer > 0) {
      this.landTimer -= dt;
      const t = 1 - this.landTimer / 0.28;
      const dip = Math.sin(t * Math.PI) * 0.18;
      this.parts.torso.position.y = 1.1 - dip;
      this.parts.leftLeg.rotation.x = dip * 2.2;
      this.parts.rightLeg.rotation.x = dip * 2.2;
      return;
    }
    this.parts.torso.position.y = 1.1;

    if (inAir) {
      const lean = vy > 0.5 ? -0.55 : vy < -2 ? 0.45 : 0.15;
      this.parts.torso.rotation.x = lean;
      this.parts.leftArm.rotation.x = vy > 0 ? -0.75 : -0.35;
      this.parts.rightArm.rotation.x = this.parts.leftArm.rotation.x;
      this.parts.leftLeg.rotation.x = vy > 0 ? 0.5 : -0.25;
      this.parts.rightLeg.rotation.x = -this.parts.leftLeg.rotation.x * 0.8;
      return;
    }

    this.parts.torso.rotation.x *= 0.85;
    const moving = speed > 0.5;
    if (moving) {
      const rate = sprinting ? 13 : speed > 9 ? 11 : 8;
      this.walkPhase += dt * rate;
      const amp = sprinting ? 0.72 : 0.55;
      const s = Math.sin(this.walkPhase) * amp;
      this.parts.leftLeg.rotation.x = s;
      this.parts.rightLeg.rotation.x = -s;
      this.parts.leftArm.rotation.x = -s * 0.5;
      this.parts.rightArm.rotation.x = s * 0.5;
      if (sprinting) this.parts.torso.rotation.x = 0.12;
    } else {
      for (const k of ['leftLeg', 'rightLeg', 'leftArm', 'rightArm']) {
        this.parts[k].rotation.x *= 0.88;
      }
    }
  }

  _poseAttack(t, weaponId) {
    const swing = t < 0.35 ? Math.sin((t / 0.35) * Math.PI) : Math.sin((1 - t) * Math.PI * 2) * 0.15;
    const thrust = weaponId === 'wooden_spear';
    this.parts.torso.rotation.x = thrust ? 0.25 * swing : -0.2 * swing;
    this.parts.torso.rotation.y = thrust ? 0 : 0.35 * swing;
    this.parts.rightArm.rotation.x = thrust ? -1.1 * swing : -1.55 * swing;
    this.parts.rightArm.rotation.z = thrust ? 0 : 0.4 * swing;
    this.parts.leftArm.rotation.x = -0.25 - swing * 0.3;
    this.parts.leftLeg.rotation.x = swing * 0.25;
    this.parts.rightLeg.rotation.x = -swing * 0.15;
  }

  _poseInteract(t) {
    const reach = Math.sin(Math.min(1, t * 1.4) * Math.PI);
    this.parts.torso.rotation.x = 0.15 * reach;
    this.parts.leftArm.rotation.x = -0.9 * reach;
    this.parts.leftArm.rotation.z = 0.2 * reach;
    this.parts.rightArm.rotation.x = -0.2 * reach;
  }
}

/** GLTF 骨骼 + 程序化叠加 — 走跑跳打采 */
export class HumanCharacter {
  constructor() {
    this.group = new THREE.Group();
    this.model = null;
    this.mixer = null;
    this.actions = {};
    this.activeAction = null;
    this.procedural = null;
    this.loaded = false;
    this.useGltf = false;
    this.bones = {};
    this.boneSpine = null;
    this.boneSpine1 = null;
    this.boneHips = null;
    this.boneRightArm = null;
    this.boneLeftArm = null;
    this.boneRightLeg = null;
    this.boneLeftLeg = null;
    this.boneRightHand = null;

    this.phase = 'locomote';
    this.locoState = 'idle';
    this.animState = '';
    this.attackTimer = 0;
    this.landTimer = 0;
    this.interactTimer = 0;
    this.breatheT = 0;
    this._attackStarted = false;
    this._lastTimeScale = 1;
    this._overlay = {};
    this._modelBaseY = 0;
  }

  async load() {
    try {
      const gltf = await preloadCharacter();
      this.model = cloneSkinnedScene(gltf.scene);
      this.model.traverse((obj) => {
        if (obj.isSkinnedMesh) {
          obj.frustumCulled = false;
          if (obj.material) obj.material.skinning = true;
        }
        if (obj.isBone) this.bones[obj.name] = obj;
      });
      this._bindBones();
      this.model.rotation.y = Math.PI;
      this.model.scale.setScalar(1.05);
      this.group.add(this.model);
      this.mixer = new THREE.AnimationMixer(this.model);
      for (const clip of gltf.animations) {
        const action = this.mixer.clipAction(clip);
        action.setEffectiveWeight(0);
        this.actions[clip.name] = action;
      }
      this.useGltf = true;
      this._playLoco(CLIPS.idle, 0.01);
    } catch {
      this.procedural = new ProceduralHuman();
      this.group.add(this.procedural.group);
    }
    this.loaded = true;
  }

  _bindBones() {
    this.boneHips = findBone(this.bones, 'Hips');
    this.boneSpine = findBone(this.bones, 'Spine');
    this.boneSpine1 = findBone(this.bones, 'Spine1', 'Spine2');
    this.boneRightArm = findBone(this.bones, 'RightArm');
    this.boneLeftArm = findBone(this.bones, 'LeftArm');
    this.boneRightLeg = findBone(this.bones, 'RightLeg');
    this.boneLeftLeg = findBone(this.bones, 'LeftLeg');
    this.boneRightHand = findBone(this.bones, 'RightHand');
  }

  _pickLoco(speed, onGround, sprinting) {
    if (!onGround) return 'air';
    let s = this.locoState;
    if (s === 'air') s = speed > 1.1 ? (sprinting || speed > 10.5 ? 'run' : 'walk') : 'idle';
    if (sprinting && speed > 5) return 'run';
    if (s === 'idle') {
      if (speed > 1.1) return speed > 10.5 ? 'run' : 'walk';
      return 'idle';
    }
    if (s === 'walk') {
      if (speed < 0.4) return 'idle';
      if (speed > 11.5 || sprinting) return 'run';
      return 'walk';
    }
    if (s === 'run') {
      if (!sprinting && speed < 8.5) return speed < 0.4 ? 'idle' : 'walk';
      return 'run';
    }
    return 'idle';
  }

  _playLoco(name, duration = 0.18) {
    if (!this.useGltf || this.animState === name) return;
    const next = this.actions[name];
    if (!next) return;
    const prev = this.activeAction;
    next.enabled = true;
    next.setEffectiveWeight(1);
    if (prev && prev !== next) prev.crossFadeTo(next, duration, false);
    next.play();
    this.activeAction = next;
    this.animState = name;
  }

  _setTimeScale(scale) {
    if (this._lastTimeScale === scale || !this.activeAction) return;
    this.activeAction.setEffectiveTimeScale(scale);
    this._lastTimeScale = scale;
  }

  _applyLocoAnim(speed, onGround, sprinting) {
    const pick = this._pickLoco(speed, onGround, sprinting);
    if (pick === 'air') {
      this.locoState = 'air';
      this._playLoco(CLIPS.run, 0.1);
      this._setTimeScale(0.35 + Math.min(0.25, Math.abs(speed) * 0.02));
      return;
    }
    this.locoState = pick;
    if (pick === 'run') {
      this._playLoco(CLIPS.run, 0.15);
      const scale = sprinting ? 1.08 + speed / RUN_REF * 0.12 : 0.95 + speed / RUN_REF * 0.15;
      this._setTimeScale(Math.min(1.35, scale));
    } else if (pick === 'walk') {
      this._playLoco(CLIPS.walk, 0.15);
      this._setTimeScale(0.85 + speed / WALK_REF * 0.25);
    } else {
      this._playLoco(CLIPS.idle, 0.2);
      this._setTimeScale(1);
    }
  }

  _startAttack(weaponId) {
    this.phase = 'attack';
    this.attackTimer = 0.48;
    this._attackStarted = true;
    this._attackWeapon = weaponId;
  }

  triggerLand() {
    this.landTimer = 0.28;
  }

  triggerInteract() {
    this.interactTimer = 0.38;
  }

  _clearOverlay() {
    this._overlay = {};
    if (this.model) {
      this.model.rotation.x = 0;
      this.model.rotation.z = 0;
      this.model.position.y = this._modelBaseY;
      this.model.position.z = 0;
    }
  }

  _applyBoneOverlay() {
    const o = this._overlay;
    if (this.boneSpine) {
      if (o.spineX != null) this.boneSpine.rotation.x += o.spineX;
      if (o.spineY != null) this.boneSpine.rotation.y += o.spineY;
      if (o.spineZ != null) this.boneSpine.rotation.z += o.spineZ;
    }
    if (this.boneSpine1 && o.spine1X != null) this.boneSpine1.rotation.x += o.spine1X;
    if (this.boneRightArm) {
      if (o.rArmX != null) this.boneRightArm.rotation.x += o.rArmX;
      if (o.rArmZ != null) this.boneRightArm.rotation.z += o.rArmZ;
    }
    if (this.boneLeftArm) {
      if (o.lArmX != null) this.boneLeftArm.rotation.x += o.lArmX;
      if (o.lArmZ != null) this.boneLeftArm.rotation.z += o.lArmZ;
    }
    if (this.boneRightLeg && o.rLegX != null) this.boneRightLeg.rotation.x += o.rLegX;
    if (this.boneLeftLeg && o.lLegX != null) this.boneLeftLeg.rotation.x += o.lLegX;
    if (this.boneHips && o.hipsY != null) this.boneHips.position.y += o.hipsY;
  }

  _poseAttack(progress, weaponId) {
    const swing = progress < 0.38
      ? Math.sin((progress / 0.38) * Math.PI)
      : Math.max(0, Math.sin(((1 - progress) / 0.62) * Math.PI) * 0.2);
    const thrust = weaponId === 'wooden_spear';
    const chop = weaponId === 'stone_axe';

    if (this.boneSpine || this.boneRightArm) {
      this._overlay.spineX = thrust ? 0.35 * swing : chop ? -0.45 * swing : -0.25 * swing;
      this._overlay.spineY = thrust ? 0.1 * swing : 0.4 * swing;
      this._overlay.rArmX = thrust ? -1.2 * swing : chop ? -1.7 * swing : -1.45 * swing;
      this._overlay.rArmZ = thrust ? 0.05 : 0.35 * swing;
      this._overlay.lArmX = -0.2 - swing * 0.35;
      this._overlay.rLegX = swing * 0.2;
      this._overlay.lLegX = -swing * 0.12;
    } else if (this.model) {
      this.model.rotation.x = -0.22 * swing;
      this.model.rotation.z = 0.08 * swing;
      this.model.position.z = 0.12 * swing;
    }
  }

  _poseInteract(progress) {
    const reach = Math.sin(Math.min(1, progress * 1.35) * Math.PI);
    if (this.boneLeftArm || this.boneSpine) {
      this._overlay.spineX = 0.18 * reach;
      this._overlay.lArmX = -0.95 * reach;
      this._overlay.lArmZ = 0.25 * reach;
      this._overlay.rArmX = -0.15 * reach;
    } else if (this.model) {
      this.model.rotation.x = 0.12 * reach;
      this.model.position.z = 0.08 * reach;
    }
  }

  _poseAir(vy, sprinting) {
    const lean = vy > 1.2 ? -0.22 : vy < -1.5 ? 0.18 : 0.06;
    const sprintLean = sprinting ? 0.06 : 0;
    if (this.boneSpine) {
      this._overlay.spineX = lean + sprintLean;
      this._overlay.lArmX = vy > 0.8 ? -0.55 : -0.25;
      this._overlay.rArmX = this._overlay.lArmX;
      this._overlay.lLegX = vy > 0.5 ? 0.45 : -0.2;
      this._overlay.rLegX = vy > 0.5 ? -0.35 : 0.15;
    } else if (this.model) {
      this.model.rotation.x = lean;
    }
  }

  _poseLand(progress) {
    const dip = Math.sin(progress * Math.PI);
    if (this.boneHips) this._overlay.hipsY = -0.06 * dip;
    if (this.boneSpine) this._overlay.spineX = 0.25 * dip;
    if (this.boneRightLeg) this._overlay.rLegX = 0.55 * dip;
    if (this.boneLeftLeg) this._overlay.lLegX = 0.55 * dip;
    else if (this.model) this.model.position.y = this._modelBaseY - 0.08 * dip;
  }

  _poseIdleBreath(t) {
    const b = Math.sin(t * 2.2) * 0.018;
    if (this.boneSpine1) this._overlay.spine1X = b;
    else if (this.boneSpine) this._overlay.spineX = b;
  }

  _poseSprintLean() {
    if (this.boneSpine) this._overlay.spineX = (this._overlay.spineX || 0) + 0.1;
  }

  update(animDt, state, equipmentMgr) {
    if (!this.loaded) return;
    const step = animDt;
    const {
      speed = 0,
      onGround = true,
      vy = 0,
      sprinting = false,
      attackPulse = false,
      interactPulse = false,
      weaponId = null,
    } = state || {};

    if (this.procedural) {
      if (attackPulse) this.procedural.triggerAttack();
      if (interactPulse) this.procedural.triggerInteract();
      this.procedural.update(step, { speed, onGround, vy, sprinting, weaponId });
      return;
    }

    if (attackPulse && !this._attackStarted && this.phase !== 'attack') {
      this._startAttack(weaponId);
    }
    if (interactPulse && this.interactTimer <= 0 && this.phase === 'locomote') {
      this.triggerInteract();
    }

    this.breatheT += step;
    this._clearOverlay();

    if (this.phase === 'attack') {
      this.attackTimer -= step;
      const progress = 1 - Math.max(0, this.attackTimer) / 0.48;
      if (this.mixer) this.mixer.update(step * 0.85);
      if (this.activeAction) {
        this.activeAction.setEffectiveWeight(Math.max(0.25, 1 - progress * 0.55));
      }
      this._poseAttack(progress, this._attackWeapon || weaponId);
      this._applyBoneOverlay();
      equipmentMgr?.applyAttackPose(progress, this._attackWeapon || weaponId);
      if (this.attackTimer <= 0) {
        this.phase = 'locomote';
        this._attackStarted = false;
        if (this.activeAction) this.activeAction.setEffectiveWeight(1);
        equipmentMgr?.resetPose();
        this.locoState = 'idle';
      }
      return;
    }

    if (this.interactTimer > 0) {
      this.interactTimer -= step;
      const progress = 1 - this.interactTimer / 0.38;
      if (this.mixer) this.mixer.update(step * 0.6);
      this._poseInteract(progress);
      this._applyBoneOverlay();
      if (this.interactTimer <= 0) this.phase = 'locomote';
      return;
    }

    if (this.landTimer > 0) {
      this.landTimer -= step;
      const progress = 1 - this.landTimer / 0.28;
      this._applyLocoAnim(speed, onGround, sprinting);
      if (this.mixer) this.mixer.update(step);
      this._poseLand(progress);
      this._applyBoneOverlay();
      if (this.landTimer <= 0) this.landTimer = 0;
      return;
    }

    this._applyLocoAnim(speed, onGround, sprinting);
    if (this.mixer) this.mixer.update(step);

    if (!onGround) {
      this._poseAir(vy, sprinting);
    } else if (speed < 0.4) {
      this._poseIdleBreath(this.breatheT);
    } else if (sprinting && speed > 8) {
      this._poseSprintLean();
    }

    this._applyBoneOverlay();
  }

  setPosition(x, y, z) {
    this.group.position.set(x, y, z);
  }

  setRotationY(yaw) {
    this.group.rotation.y = yaw;
  }

  getEyeHeight() {
    return this.useGltf ? 1.55 : 1.5;
  }

  /** 武器挂到右手骨骼（若有） */
  attachEquipmentSocket(socket) {
    if (this.boneRightHand) {
      this.boneRightHand.add(socket);
      socket.position.set(0, 0, 0);
      socket.rotation.set(0, 0, 0);
      return true;
    }
    return false;
  }
}
