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

  update(dt, speed, onGround, isAttacking, isJumping) {
    if (isAttacking) {
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
      this.parts.leftLeg.rotation.x *= 0.85;
      this.parts.rightLeg.rotation.x *= 0.85;
      this.parts.leftArm.rotation.x *= 0.85;
      this.parts.rightArm.rotation.x *= 0.85;
    }
  }
}

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
    this.jumpTimer = 0;
    this.animState = 'Idle';
    this.bones = {};
    this._boneRest = new Map();
  }

  async load() {
    try {
      const gltf = await preloadCharacter();
      this.model = cloneSkinnedScene(gltf.scene);
      this.model.traverse((obj) => {
        if (obj.isMesh) {
          obj.frustumCulled = true;
          if (obj.material) obj.material.skinning = true;
        }
        if (obj.isBone) this._cacheBone(obj);
      });
      this.model.rotation.y = Math.PI;
      this.model.scale.setScalar(1.05);
      this.group.add(this.model);
      this.mixer = new THREE.AnimationMixer(this.model);
      for (const clip of gltf.animations) {
        this.actions[clip.name] = this.mixer.clipAction(clip);
      }
      this.useGltf = true;
      this._setAnim('Idle', 0.01);
    } catch {
      this.procedural = new ProceduralHuman();
      this.group.add(this.procedural.group);
    }
    this.loaded = true;
  }

  _cacheBone(bone) {
    const n = bone.name;
    if (n.includes('RightArm') && !n.includes('ForeArm') && !this.bones.rightArm) this.bones.rightArm = bone;
    if (n.includes('RightForeArm')) this.bones.rightForeArm = bone;
    if (n.includes('LeftArm') && !n.includes('ForeArm') && !this.bones.leftArm) this.bones.leftArm = bone;
    if (n.includes('LeftForeArm')) this.bones.leftForeArm = bone;
    if (n.includes('RightUpLeg') || (n.includes('RightLeg') && !n.includes('Fore'))) this.bones.rightUpLeg = bone;
    if (n.includes('LeftUpLeg') || (n.includes('LeftLeg') && !n.includes('Fore'))) this.bones.leftUpLeg = bone;
    if (n.includes('Spine') && !this.bones.spine) this.bones.spine = bone;
    if (!this._boneRest.has(bone)) {
      this._boneRest.set(bone, bone.rotation.clone());
    }
  }

  _setAnim(name, duration = 0.15) {
    if (!this.useGltf || this.animState === name) return;
    const next = this.actions[name];
    if (!next) return;
    if (this.activeAction && this.activeAction !== next) {
      this.activeAction.fadeOut(duration);
    }
    next.reset().fadeIn(duration).play();
    this.activeAction = next;
    this.animState = name;
  }

  triggerLand() {
    this.jumpTimer = 0.15;
  }

  _applyAttackPose(t) {
    const swing = Math.sin(t * Math.PI);
    const rArm = this.bones.rightArm;
    const rFore = this.bones.rightForeArm;
    const spine = this.bones.spine;
    if (rArm) {
      const rest = this._boneRest.get(rArm);
      rArm.rotation.x = rest.x - 1.6 * swing;
      rArm.rotation.z = rest.z + 0.35 * swing;
    }
    if (rFore) {
      const rest = this._boneRest.get(rFore);
      rFore.rotation.x = rest.x - 0.9 * swing;
    }
    if (spine) {
      const rest = this._boneRest.get(spine);
      spine.rotation.x = rest.x + 0.25 * swing;
    }
  }

  _applyJumpPose(t) {
    const rLeg = this.bones.rightUpLeg;
    const lLeg = this.bones.leftUpLeg;
    const rArm = this.bones.rightArm;
    const lArm = this.bones.leftArm;
    if (rLeg) {
      const rest = this._boneRest.get(rLeg);
      rLeg.rotation.x = rest.x + 0.55 * t;
    }
    if (lLeg) {
      const rest = this._boneRest.get(lLeg);
      lLeg.rotation.x = rest.x - 0.45 * t;
    }
    if (rArm) {
      const rest = this._boneRest.get(rArm);
      rArm.rotation.x = rest.x - 0.7 * t;
    }
    if (lArm) {
      const rest = this._boneRest.get(lArm);
      lArm.rotation.x = rest.x - 0.7 * t;
    }
  }

  _resetBones() {
    for (const [bone, rest] of this._boneRest) {
      bone.rotation.copy(rest);
    }
  }

  tickState(speed, onGround, isAttacking, isJumping) {
    if (!this.loaded || this.procedural) return;

    if (isAttacking) {
      this.attackTimer = 0.42;
      return;
    }

    if (isJumping || !onGround) {
      this.jumpTimer = 0.2;
      this._setAnim('Run', 0.08);
      if (this.activeAction) this.activeAction.timeScale = 0.25;
      return;
    }

    if (this.attackTimer > 0) return;

    if (speed > 9.5) this._setAnim('Run', 0.12);
    else if (speed > 0.6) this._setAnim('Walk', 0.12);
    else this._setAnim('Idle', 0.18);
  }

  tickAnim(dt, equipmentMgr) {
    if (!this.loaded) return;
    if (this.procedural) return;

    if (this.mixer) this.mixer.update(dt);

    if (this.attackTimer > 0) {
      this.attackTimer -= dt;
      const t = 1 - this.attackTimer / 0.42;
      this._setAnim('Idle', 0.04);
      if (this.activeAction) this.activeAction.timeScale = 0.15;
      this._applyAttackPose(t);
      equipmentMgr?.applyAttackPose(t);
      return;
    }

    equipmentMgr?.resetPose();

    if (this.jumpTimer > 0) {
      this.jumpTimer -= dt;
      this._applyJumpPose(Math.min(1, this.jumpTimer / 0.2));
      return;
    }

    this._resetBones();

    if (this.activeAction) {
      if (this.animState === 'Run') this.activeAction.timeScale = 1.05;
      else if (this.animState === 'Walk') this.activeAction.timeScale = 1;
      else this.activeAction.timeScale = 1;
    }
  }

  update(dt, speed, onGround, isAttacking, equipmentMgr) {
    const isJumping = !onGround;
    if (this.procedural) {
      this.procedural.update(dt, speed, onGround, isAttacking, isJumping);
      return;
    }
    this.tickState(speed, onGround, isAttacking, isJumping);
    this.tickAnim(dt, equipmentMgr);
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
