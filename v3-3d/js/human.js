import * as THREE from 'three';

/** 程序化拟真人体（头、躯干、四肢 + 行走动画） */
export class HumanCharacter {
  constructor() {
    this.group = new THREE.Group();
    this.meshParts = {};
    this.walkPhase = 0;
    this.velocity = new THREE.Vector3();

    const skin = new THREE.MeshStandardMaterial({ color: 0xe8b4a0, roughness: 0.65 });
    const shirt = new THREE.MeshStandardMaterial({ color: 0x3d5a80, roughness: 0.7 });
    const pants = new THREE.MeshStandardMaterial({ color: 0x2b2d42, roughness: 0.75 });
    const hair = new THREE.MeshStandardMaterial({ color: 0x3d2314, roughness: 0.8 });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.28), shirt);
    torso.position.y = 1.15;
    this.group.add(torso);
    this.meshParts.torso = torso;

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), skin);
    head.position.y = 1.65;
    this.group.add(head);

    const hairMesh = new THREE.Mesh(new THREE.SphereGeometry(0.23, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), hair);
    hairMesh.position.y = 1.72;
    this.group.add(hairMesh);

    this.meshParts.leftLeg = this._limb(0.14, 0.55, pants, -0.14, 0.55, 'leg');
    this.meshParts.rightLeg = this._limb(0.14, 0.55, pants, 0.14, 0.55, 'leg');
    this.meshParts.leftArm = this._limb(0.1, 0.45, skin, -0.38, 1.25, 'arm');
    this.meshParts.rightArm = this._limb(0.1, 0.45, skin, 0.38, 1.25, 'arm');

    this.group.position.y = 0;
  }

  _limb(w, h, mat, x, pivotY, type) {
    const pivot = new THREE.Group();
    pivot.position.set(x, pivotY, 0);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * 0.8), mat);
    mesh.position.y = -h / 2;
    pivot.add(mesh);
    this.group.add(pivot);
    pivot.userData.limbType = type;
    return pivot;
  }

  update(dt, speed, onGround, isAttacking) {
    const moving = speed > 0.5;
    if (moving && onGround) {
      this.walkPhase += dt * (speed > 7 ? 14 : 9);
      const swing = Math.sin(this.walkPhase) * (speed > 7 ? 0.65 : 0.45);
      this.meshParts.leftLeg.rotation.x = swing;
      this.meshParts.rightLeg.rotation.x = -swing;
      this.meshParts.leftArm.rotation.x = -swing * 0.6;
      this.meshParts.rightArm.rotation.x = swing * 0.6;
    } else {
      this.meshParts.leftLeg.rotation.x *= 0.85;
      this.meshParts.rightLeg.rotation.x *= 0.85;
      this.meshParts.leftArm.rotation.x *= 0.85;
      this.meshParts.rightArm.rotation.x *= 0.85;
    }

    if (isAttacking) {
      this.meshParts.rightArm.rotation.x = -1.2;
      this.meshParts.torso.rotation.y = 0.2;
    } else {
      this.meshParts.torso.rotation.y *= 0.88;
      if (Math.abs(this.meshParts.torso.rotation.y) < 0.02) this.meshParts.torso.rotation.y = 0;
    }

    const bob = moving ? Math.abs(Math.sin(this.walkPhase * 2)) * 0.04 : 0;
    this.meshParts.torso.position.y = 1.15 + bob;
  }

  setPosition(x, y, z) {
    this.group.position.set(x, y, z);
  }

  setRotationY(yaw) {
    this.group.rotation.y = yaw;
  }
}
