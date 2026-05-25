import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SkeletonUtils } from 'three/addons/utils/SkeletonUtils.js';

const MODEL_URL = 'https://threejs.org/examples/models/gltf/Soldier.glb';

/** 全局只加载一次，避免重启卡顿 */
let _gltfCache = null;
let _preloadPromise = null;

export function preloadCharacter() {
  if (!_preloadPromise) {
    _preloadPromise = new GLTFLoader()
      .loadAsync(MODEL_URL)
      .then((g) => {
        _gltfCache = g;
        return g;
      })
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

  update(dt, speed, onGround, isAttacking) {
    const moving = speed > 0.5 && onGround;
    if (moving) {
      this.walkPhase += dt * (speed > 9 ? 12 : 8);
      const s = Math.sin(this.walkPhase) * 0.5;
      this.parts.leftLeg.rotation.x = s;
      this.parts.rightLeg.rotation.x = -s;
    }
    if (isAttacking) this.parts.rightArm.rotation.x = -1.2;
  }
}

export class HumanCharacter {
  constructor() {
    this.group = new THREE.Group();
    this.model = null;
    this.mixer = null;
    this.actions = {};
    this.activeAction = null;
    this.state = '';
    this.procedural = null;
    this.loaded = false;
    this.useGltf = false;
    this.attackTimer = 0;
    this.animState = 'Idle';
  }

  async load() {
    try {
      const gltf = await preloadCharacter();
      this.model = SkeletonUtils.clone(gltf.scene);
      this.model.traverse((obj) => {
        if (obj.isMesh) {
          obj.frustumCulled = true;
          if (obj.material) obj.material.skinning = true;
        }
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
    this.state = name;
  }

  triggerLand() {}

  /** 逻辑状态（固定步长） */
  tickState(speed, onGround, isAttacking) {
    if (!this.loaded || this.procedural) return;
    if (isAttacking) this.attackTimer = 0.35;
    if (this.attackTimer > 0) return;

    if (!onGround) this._setAnim('Run', 0.1);
    else if (speed > 9.5) this._setAnim('Run', 0.15);
    else if (speed > 0.6) this._setAnim('Walk', 0.15);
    else this._setAnim('Idle', 0.2);
  }

  /** 动画混合（每渲染帧一次） */
  tickAnim(dt) {
    if (!this.loaded) return;
    if (this.procedural) return;
    if (this.mixer) this.mixer.update(dt);
    if (this.attackTimer > 0) {
      this.attackTimer -= dt;
      this._setAnim('Run', 0.05);
      if (this.activeAction) this.activeAction.timeScale = 2.2;
      return;
    }
    if (this.activeAction) {
      if (this.animState === 'Run') this.activeAction.timeScale = 1.1;
      else if (this.animState === 'Walk') this.activeAction.timeScale = 1;
      else this.activeAction.timeScale = 1;
    }
  }

  update(dt, speed, onGround, isAttacking) {
    if (this.procedural) {
      this.procedural.update(dt, speed, onGround, isAttacking);
      return;
    }
    this.tickState(speed, onGround, isAttacking);
    this.tickAnim(dt);
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
