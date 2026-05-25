import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinnedScene } from 'three/addons/utils/SkeletonUtils.js';

const MODEL_URL = 'https://threejs.org/examples/models/gltf/Soldier.glb';
const LOAD_TIMEOUT_MS = 15000;

let _preloadPromise = null;

export function preloadCharacter() {
  if (!_preloadPromise) {
    const loader = new GLTFLoader().loadAsync(MODEL_URL);
    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('角色模型加载超时')), LOAD_TIMEOUT_MS);
    });
    _preloadPromise = Promise.race([loader, timeout])
      .then((g) => g)
      .catch((err) => {
        _preloadPromise = null;
        throw err;
      });
  }
  return _preloadPromise;
}

class ProceduralHuman {
  constructor() {
    this.group = new THREE.Group();
    this.parts = {};
    this.walkPhase = 0;
    const skin = new THREE.MeshLambertMaterial({ color: 0xe8b4a0 });
    const shirt = new THREE.MeshLambertMaterial({ color: 0x4a5568 });
    const pants = new THREE.MeshLambertMaterial({ color: 0x2d3748 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.65, 0.26), shirt);
    torso.position.y = 1.1;
    this.group.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), skin);
    head.position.y = 1.55;
    this.group.add(head);
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

  update(dt, speed, onGround, attackPulse, isJumping) {
    if (attackPulse) {
      this.parts.rightArm.rotation.x = -1.35;
      this.parts.leftArm.rotation.x = -0.3;
      return;
    }
    if (isJumping) {
      this.parts.leftLeg.rotation.x = 0.45;
      this.parts.rightLeg.rotation.x = -0.35;
      this.parts.leftArm.rotation.x = -0.6;
      this.parts.rightArm.rotation.x = -0.6;
      return;
    }
    const moving = speed > 0.5 && onGround;
    if (moving) {
      this.walkPhase += dt * (speed > 9 ? 12 : 8);
      const s = Math.sin(this.walkPhase) * 0.55;
      this.parts.leftLeg.rotation.x = s;
      this.parts.rightLeg.rotation.x = -s;
      this.parts.leftArm.rotation.x = -s * 0.45;
      this.parts.rightArm.rotation.x = s * 0.45;
    } else {
      for (const k of ['leftLeg', 'rightLeg', 'leftArm', 'rightArm']) {
        this.parts[k].rotation.x *= 0.88;
      }
    }
  }
}

/**  locomotion 带迟滞，避免 Walk/Run 边界反复 crossFade 导致走路卡顿 */
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
    this.attackTimer = 0;
    this.animState = '';
    this.locoState = 'idle';
    this.phase = 'locomote';
    this._attackStarted = false;
    this._lastTimeScale = 1;
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
      });
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
      this._playLoco('Idle', 0.01);
    } catch {
      this.procedural = new ProceduralHuman();
      this.group.add(this.procedural.group);
    }
    this.loaded = true;
  }

  _pickLoco(speed, onGround) {
    if (!onGround) return 'air';
    let s = this.locoState;
    if (s === 'air') s = speed > 1.1 ? (speed > 10.5 ? 'run' : 'walk') : 'idle';
    if (s === 'idle') {
      if (speed > 1.1) return speed > 10.5 ? 'run' : 'walk';
      return 'idle';
    }
    if (s === 'walk') {
      if (speed < 0.4) return 'idle';
      if (speed > 11.5) return 'run';
      return 'walk';
    }
    if (s === 'run') {
      if (speed < 8.5) return speed < 0.4 ? 'idle' : 'walk';
      return 'run';
    }
  }

  _playLoco(name, duration = 0.18) {
    if (!this.useGltf || this.animState === name) return;
    const next = this.actions[name];
    if (!next) return;
    const prev = this.activeAction;
    next.enabled = true;
    next.setEffectiveWeight(1);
    if (prev && prev !== next) {
      prev.crossFadeTo(next, duration, false);
    }
    next.play();
    this.activeAction = next;
    this.animState = name;
  }

  _setTimeScale(scale) {
    if (this._lastTimeScale === scale || !this.activeAction) return;
    this.activeAction.setEffectiveTimeScale(scale);
    this._lastTimeScale = scale;
  }

  _applyLocoAnim(speed, onGround) {
    const pick = this._pickLoco(speed, onGround);
    if (pick === 'air') {
      this.locoState = 'air';
      this._playLoco('Run', 0.12);
      this._setTimeScale(0.42);
      return;
    }
    this.locoState = pick;
    if (pick === 'run') {
      this._playLoco('Run', 0.15);
      this._setTimeScale(1.04);
    } else if (pick === 'walk') {
      this._playLoco('Walk', 0.15);
      this._setTimeScale(1);
    } else {
      this._playLoco('Idle', 0.2);
      this._setTimeScale(1);
    }
  }

  _startAttack() {
    this.phase = 'attack';
    this.attackTimer = 0.45;
    this._attackStarted = true;
    this._playLoco('Idle', 0.06);
    if (this.activeAction) this.activeAction.setEffectiveTimeScale(0.12);
  }

  _attackVisual(progress) {
    const swing = Math.sin(progress * Math.PI);
    if (!this.model) return;
    this.model.rotation.x = -0.2 * swing;
    this.model.position.z = 0.1 * swing;
  }

  _resetModelOffset() {
    if (!this.model) return;
    this.model.rotation.x = 0;
    this.model.position.z = 0;
  }

  triggerLand() {}

  update(animDt, speed, onGround, attackPulse, equipmentMgr) {
    if (!this.loaded) return;
    const step = animDt;

    if (this.procedural) {
      this.procedural.update(step, speed, onGround, attackPulse, !onGround);
      return;
    }

    if (attackPulse && !this._attackStarted) this._startAttack();

    if (this.phase === 'attack') {
      this.attackTimer -= step;
      const progress = 1 - Math.max(0, this.attackTimer) / 0.45;
      if (this.mixer) this.mixer.update(step);
      this._attackVisual(progress);
      equipmentMgr?.applyAttackPose(progress);
      if (this.attackTimer <= 0) {
        this.phase = 'locomote';
        this._attackStarted = false;
        this._resetModelOffset();
        equipmentMgr?.resetPose();
        this.locoState = 'idle';
      }
      return;
    }

    this._applyLocoAnim(speed, onGround);
    if (this.mixer) this.mixer.update(step);
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
}
