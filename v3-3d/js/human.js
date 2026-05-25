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

/**
 * Soldier GLTF 动画：仅用 AnimationMixer，不每帧重置骨骼。
 * 攻击/跳跃通过模型整体偏移 + 装备挂点表现，避免闪烁。
 */
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
    this.phase = 'locomote';
    this._attackStarted = false;
  }

  async load() {
    try {
      const gltf = await preloadCharacter();
      this.model = cloneSkinnedScene(gltf.scene);
      this.model.traverse((obj) => {
        if (obj.isSkinnedMesh) {
          obj.frustumCulled = false;
          if (obj.material) {
            obj.material.skinning = true;
          }
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
      this._crossfadeTo('Idle', 0.01);
    } catch {
      this.procedural = new ProceduralHuman();
      this.group.add(this.procedural.group);
    }
    this.loaded = true;
  }

  _crossfadeTo(name, duration = 0.2) {
    if (!this.useGltf || this.animState === name) return;
    const next = this.actions[name];
    if (!next) return;
    const prev = this.activeAction;

    next.enabled = true;
    next.setEffectiveWeight(1);

    if (prev && prev !== next) {
      prev.crossFadeTo(next, duration, true);
    }
    next.play();

    this.activeAction = next;
    this.animState = name;
  }

  _startAttack() {
    this.phase = 'attack';
    this.attackTimer = 0.45;
    this._attackStarted = true;
    this._crossfadeTo('Idle', 0.08);
    if (this.activeAction) this.activeAction.setEffectiveTimeScale(0.1);
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

  update(dt, speed, onGround, attackPulse, equipmentMgr) {
    if (!this.loaded) return;

    const step = Math.min(dt, 0.05);

    if (this.procedural) {
      this.procedural.update(step, speed, onGround, attackPulse, !onGround);
      return;
    }

    if (attackPulse && !this._attackStarted) {
      this._startAttack();
    }

    if (this.phase === 'attack') {
      this.attackTimer -= step;
      const progress = 1 - Math.max(0, this.attackTimer) / 0.45;
      if (this.mixer) this.mixer.update(step);
      this._attackVisual(progress);
      equipmentMgr?.applyAttackPose(progress);

      if (this.attackTimer <= 0) {
        this.phase = onGround ? 'locomote' : 'air';
        this._attackStarted = false;
        this._resetModelOffset();
        equipmentMgr?.resetPose();
        if (this.activeAction) this.activeAction.setEffectiveTimeScale(1);
      }
      return;
    }

    if (!onGround) {
      this.phase = 'air';
      this._crossfadeTo('Run', 0.15);
      if (this.activeAction) this.activeAction.setEffectiveTimeScale(0.45);
    } else {
      this.phase = 'locomote';
      if (speed > 9.5) {
        this._crossfadeTo('Run', 0.2);
        if (this.activeAction) this.activeAction.setEffectiveTimeScale(1.05);
      } else if (speed > 0.55) {
        this._crossfadeTo('Walk', 0.2);
        if (this.activeAction) this.activeAction.setEffectiveTimeScale(1);
      } else {
        this._crossfadeTo('Idle', 0.25);
        if (this.activeAction) this.activeAction.setEffectiveTimeScale(1);
      }
    }

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
