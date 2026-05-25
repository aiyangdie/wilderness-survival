import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/** Three.js 官方 Soldier 模型（带 Idle / Walk / Run 骨骼动画） */
const MODEL_URL = 'https://threejs.org/examples/models/gltf/Soldier.glb';

/** 程序化备用人体（加载失败时使用） */
class ProceduralHuman {
  constructor() {
    this.group = new THREE.Group();
    this.parts = {};
    this.walkPhase = 0;

    const skin = new THREE.MeshLambertMaterial({ color: 0xe8b4a0 });
    const shirt = new THREE.MeshLambertMaterial({ color: 0x4a5568 });
    const pants = new THREE.MeshLambertMaterial({ color: 0x2d3748 });

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.55, 4, 8), shirt);
    torso.position.y = 1.1;
    this.group.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), skin);
    head.position.y = 1.55;
    this.group.add(head);

    this.parts.leftLeg = this._limb(pants, -0.12, 0.5);
    this.parts.rightLeg = this._limb(pants, 0.12, 0.5);
    this.parts.leftArm = this._limb(skin, -0.34, 1.15, 0.08, 0.38);
    this.parts.rightArm = this._limb(skin, 0.34, 1.15, 0.08, 0.38);
  }

  _limb(mat, x, py, w = 0.11, h = 0.48) {
    const p = new THREE.Group();
    p.position.set(x, py, 0);
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(w, h, 3, 6), mat);
    m.position.y = -h / 2;
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
      this.parts.leftArm.rotation.x = -s * 0.5;
      this.parts.rightArm.rotation.x = s * 0.5;
    }
    if (isAttacking) this.parts.rightArm.rotation.x = -1.2;
  }
}

/**
 * 拟真角色：GLTF 骨骼人物 + 动画状态机
 */
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
    this.landSquash = 0;
  }

  async load() {
    try {
      const gltf = await new GLTFLoader().loadAsync(MODEL_URL);
      this.model = gltf.scene;

      this.model.traverse((obj) => {
        if (obj.isMesh) {
          obj.frustumCulled = true;
          if (obj.material) {
            obj.material.skinning = true;
          }
        }
      });

      // 模型朝向与比例（约 1.75m 高）
      this.model.rotation.y = Math.PI;
      this.model.scale.setScalar(1.05);
      this.model.position.y = 0;

      this.group.add(this.model);
      this.mixer = new THREE.AnimationMixer(this.model);

      for (const clip of gltf.animations) {
        const action = this.mixer.clipAction(clip);
        action.setEffectiveTimeScale(1);
        action.setEffectiveWeight(1);
        this.actions[clip.name] = action;
      }

      this.useGltf = true;
      this._fadeTo('Idle', 0.01);
    } catch (err) {
      console.warn('[HumanCharacter] GLTF 加载失败，使用备用模型', err);
      this.procedural = new ProceduralHuman();
      this.group.add(this.procedural.group);
    }
    this.loaded = true;
  }

  _fadeTo(name, duration = 0.2) {
    if (!this.useGltf) return;
    const next = this.actions[name];
    if (!next || this.state === name) return;

    const prev = this.activeAction;
    if (prev && prev !== next) prev.fadeOut(duration);

    next.reset().fadeIn(duration).play();
    this.activeAction = next;
    this.state = name;
  }

  triggerLand() {
    this.landSquash = 0.15;
  }

  update(dt, speed, onGround, isAttacking) {
    if (!this.loaded) return;

    if (this.procedural) {
      this.procedural.update(dt, speed, onGround, isAttacking);
      return;
    }

    if (this.mixer) this.mixer.update(dt);

    if (isAttacking) this.attackTimer = 0.38;
    if (this.attackTimer > 0) {
      this.attackTimer -= dt;
      this._fadeTo('Run', 0.08);
      if (this.activeAction) {
        this.activeAction.timeScale = 2.4;
      }
      return;
    }

    if (!onGround) {
      this._fadeTo('Run', 0.12);
      if (this.activeAction) this.activeAction.timeScale = 1.15;
    } else if (speed > 9.5) {
      this._fadeTo('Run', 0.18);
      if (this.activeAction) this.activeAction.timeScale = 1.05 + speed / 14;
    } else if (speed > 0.6) {
      this._fadeTo('Walk', 0.18);
      if (this.activeAction) this.activeAction.timeScale = 0.85 + speed / 11;
    } else {
      this._fadeTo('Idle', 0.22);
      if (this.activeAction) this.activeAction.timeScale = 1;
    }

    if (this.landSquash > 0) {
      this.landSquash = Math.max(0, this.landSquash - dt * 2.5);
      const squash = 1 - this.landSquash * 0.08;
      this.model.scale.y = 1.05 * squash;
    } else if (this.model) {
      this.model.scale.y = 1.05;
    }
  }

  setPosition(x, y, z) {
    this.group.position.set(x, y, z);
  }

  setRotationY(yaw) {
    this.group.rotation.y = yaw;
  }

  /** 供相机瞄准的高度 */
  getEyeHeight() {
    return this.useGltf ? 1.55 : 1.5;
  }
}
