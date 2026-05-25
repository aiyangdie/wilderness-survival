import * as THREE from 'three';

/** 程序化拟真人体 + 呼吸/落地细节 */
export class HumanCharacter {
  constructor() {
    this.group = new THREE.Group();
    this.meshParts = {};
    this.walkPhase = 0;
    this.idlePhase = Math.random() * Math.PI * 2;
    this.landSquash = 0;

    const skin = new THREE.MeshLambertMaterial({ color: 0xe8b4a0 });
    const shirt = new THREE.MeshLambertMaterial({ color: 0x3d5a80 });
    const pants = new THREE.MeshLambertMaterial({ color: 0x2b2d42 });
    const hair = new THREE.MeshLambertMaterial({ color: 0x3d2314 });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.28), shirt);
    torso.position.y = 1.15;
    this.group.add(torso);
    this.meshParts.torso = torso;

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), skin);
    head.position.y = 1.65;
    this.group.add(head);
    this.meshParts.head = head;

    const hairMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.23, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      hair
    );
    hairMesh.position.y = 1.72;
    this.group.add(hairMesh);

    this.meshParts.leftLeg = this._limb(0.14, 0.55, pants, -0.14, 0.55);
    this.meshParts.rightLeg = this._limb(0.14, 0.55, pants, 0.14, 0.55);
    this.meshParts.leftArm = this._limb(0.1, 0.45, skin, -0.38, 1.25);
    this.meshParts.rightArm = this._limb(0.1, 0.45, skin, 0.38, 1.25);

    this.baseTorsoY = 1.15;
    this.baseHeadY = 1.65;
  }

  _limb(w, h, mat, x, pivotY) {
    const pivot = new THREE.Group();
    pivot.position.set(x, pivotY, 0);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * 0.8), mat);
    mesh.position.y = -h / 2;
    pivot.add(mesh);
    this.group.add(pivot);
    return pivot;
  }

  triggerLand() {
    this.landSquash = 0.18;
  }

  update(dt, speed, onGround, isAttacking, justLanded = false) {
    if (justLanded) this.triggerLand();
    if (this.landSquash > 0) this.landSquash = Math.max(0, this.landSquash - dt * 2.2);

    const moving = speed > 0.5;
    if (moving && onGround) {
      this.walkPhase += dt * (speed > 9 ? 14 : 9);
      const swing = Math.sin(this.walkPhase) * (speed > 9 ? 0.65 : 0.45);
      this.meshParts.leftLeg.rotation.x = swing;
      this.meshParts.rightLeg.rotation.x = -swing;
      this.meshParts.leftArm.rotation.x = -swing * 0.55;
      this.meshParts.rightArm.rotation.x = swing * 0.55;
    } else if (onGround) {
      this.idlePhase += dt * 1.8;
      const breath = Math.sin(this.idlePhase) * 0.03;
      this.meshParts.leftLeg.rotation.x *= 0.9;
      this.meshParts.rightLeg.rotation.x *= 0.9;
      this.meshParts.leftArm.rotation.x = breath * 2;
      this.meshParts.rightArm.rotation.x = -breath * 2;
    }

    if (isAttacking) {
      this.meshParts.rightArm.rotation.x = -1.25;
      this.meshParts.torso.rotation.y = 0.22;
    } else {
      this.meshParts.torso.rotation.y *= 0.88;
      if (Math.abs(this.meshParts.torso.rotation.y) < 0.02) this.meshParts.torso.rotation.y = 0;
    }

    const bob = moving ? Math.abs(Math.sin(this.walkPhase * 2)) * 0.05 : 0;
    const squash = this.landSquash * 0.12;
    this.meshParts.torso.position.y = this.baseTorsoY + bob - squash;
    this.meshParts.head.position.y = this.baseHeadY + bob * 0.5 - squash;
    this.meshParts.torso.scale.y = 1 - squash * 0.5;
  }

  setPosition(x, y, z) {
    this.group.position.set(x, y, z);
  }

  setRotationY(yaw) {
    this.group.rotation.y = yaw;
  }
}
