import * as THREE from 'three';
import { CFG, RESOURCES, CREATURES } from './config.js';
import { HeightField, terrainHeight } from './terrain.js';
import { createCreatureVisual } from './creatures.js';

const shared = {
  trunkGeo: new THREE.CylinderGeometry(0.22, 0.3, 2, 4),
  crownGeo: new THREE.ConeGeometry(1.1, 2.4, 4),
  rockGeo: new THREE.DodecahedronGeometry(0.75, 0),
  bushGeo: new THREE.SphereGeometry(0.55, 4, 4),
  trunkMat: new THREE.MeshLambertMaterial({ color: 0x5c4033 }),
  crownMat: new THREE.MeshLambertMaterial({ color: 0x2d6a3e }),
  rockMat: new THREE.MeshLambertMaterial({ color: 0x6c757d }),
  bushMat: new THREE.MeshLambertMaterial({ color: 0x40916c }),
};

/** InstancedMesh 批量渲染，极大减少 draw call */
class PropBatch {
  constructor(scene, geo, mat, max) {
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = true;
    scene.add(this.mesh);
    this.max = max;
    this.count = 0;
    this._dummy = new THREE.Object3D();
    this._hidden = new THREE.Vector3(0, -999, 0);
  }

  add(x, y, z, sy = 1) {
    if (this.count >= this.max) return -1;
    const i = this.count++;
    this._set(i, x, y, z, sy);
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    return i;
  }

  setAt(i, x, y, z, sy = 1) {
    if (i >= this.max) return;
    this._set(i, x, y, z, sy);
    if (i >= this.count) {
      this.count = i + 1;
      this.mesh.count = this.count;
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  _set(i, x, y, z, sy = 1) {
    this._dummy.position.set(x, y, z);
    this._dummy.scale.set(sy, sy, sy);
    this._dummy.updateMatrix();
    this.mesh.setMatrixAt(i, this._dummy.matrix);
  }

  hide(i) {
    if (i < 0) return;
    this._set(i, -999, -999, -999, 0.001);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export class World3D {
  constructor(scene) {
    this.scene = scene;
    this.size = CFG.worldSize;
    this.entities = [];
    this.colliders = [];
    this.heightField = null;
    this.batches = {};
  }

  generate() {
    const seg = CFG.terrainSegments;
    this.heightField = new HeightField(this.size, seg);

    const groundGeo = new THREE.PlaneGeometry(this.size, this.size, seg, seg);
    const pos = groundGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setZ(i, terrainHeight(pos.getX(i), pos.getY(i)));
    }
    groundGeo.computeVertexNormals();

    const ground = new THREE.Mesh(
      groundGeo,
      new THREE.MeshLambertMaterial({ color: 0x3d5a3c, flatShading: true })
    );
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);
    this.ground = ground;

    const half = this.getBoundsHalf() - 1;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(half - 1.2, half, 48),
      new THREE.MeshBasicMaterial({
        color: 0x4a6741,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.15;
    this.scene.add(ring);
    this.boundaryRing = ring;

    const max = CFG.spawn.tree + CFG.spawn.rock + CFG.spawn.bush + 10;
    this.batches.trunk = new PropBatch(this.scene, shared.trunkGeo, shared.trunkMat, max);
    this.batches.crown = new PropBatch(this.scene, shared.crownGeo, shared.crownMat, max);
    this.batches.rock = new PropBatch(this.scene, shared.rockGeo, shared.rockMat, CFG.spawn.rock + 5);
    this.batches.bush = new PropBatch(this.scene, shared.bushGeo, shared.bushMat, CFG.spawn.bush + 5);

    const place = (type, count) => {
      for (let i = 0; i < count; i++) this._trySpawn(type, 20);
    };
    place('tree', CFG.spawn.tree);
    place('rock', CFG.spawn.rock);
    place('bush', CFG.spawn.bush);
    place('deer', CFG.spawn.deer);
    place('rabbit', CFG.spawn.rabbit);
    place('wolf', CFG.spawn.wolf);
  }

  _trySpawn(type, attempts) {
    for (let i = 0; i < attempts; i++) {
      const x = (Math.random() - 0.5) * this.size * 0.8;
      const z = (Math.random() - 0.5) * this.size * 0.8;
      if (Math.hypot(x, z) < 8) continue;
      const def = RESOURCES[type] || CREATURES[type];
      if (this._collides(x, z, def.radius || 1)) continue;
      this.entities.push(this._createEntity(type, x, z, def));
      if (RESOURCES[type]) this.colliders.push({ x, z, r: def.radius || 1 });
      return;
    }
  }

  _collides(x, z, r) {
    for (const c of this.colliders) {
      if (Math.hypot(x - c.x, z - c.z) < c.r + r + 0.5) return true;
    }
    return false;
  }

  _createEntity(type, x, z, def) {
    const y = this.getHeightAt(x, z);
    let mesh = null;
    let visual = null;
    let batchIdx = -1;
    let batchKey = null;

    if (type === 'tree') {
      batchIdx = this.batches.trunk.count;
      this.batches.trunk.setAt(batchIdx, x, y + 1, z);
      this.batches.crown.setAt(batchIdx, x, y + 2.8, z);
      batchKey = 'tree';
    } else if (type === 'rock') {
      batchIdx = this.batches.rock.add(x, y + 0.45, z);
      batchKey = 'rock';
    } else if (type === 'bush') {
      batchIdx = this.batches.bush.add(x, y + 0.4, z);
      batchKey = 'bush';
    } else {
      visual = createCreatureVisual(type);
      if (visual) {
        visual.group.position.set(x, y, z);
        this.scene.add(visual.group);
        mesh = visual.group;
      }
    }

    return {
      id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
      type,
      mesh,
      visual,
      batchKey,
      batchIdx,
      x,
      z,
      y,
      hp: def.hp,
      maxHp: def.hp,
      def,
      dead: false,
      passive: !!def.passive,
      radius: def.radius || 1,
      _lastX: x,
      _lastZ: z,
      _fleeStamina: 85,
      _faceX: x,
      _faceZ: z,
    };
  }

  hideEntityVisual(e) {
    if (e.batchKey === 'tree') {
      this.batches.trunk.hide(e.batchIdx);
      this.batches.crown.hide(e.batchIdx);
    } else if (e.batchKey === 'rock') {
      this.batches.rock.hide(e.batchIdx);
    } else if (e.batchKey === 'bush') {
      this.batches.bush.hide(e.batchIdx);
    } else if (e.visual) {
      e.visual.dispose();
    } else if (e.mesh) {
      this.scene.remove(e.mesh);
    }
  }

  getHeightAt(x, z) {
    return this.heightField?.sample(x, z) ?? terrainHeight(x, z);
  }

  getBoundsHalf() {
    return this.size * (CFG.worldBounds ?? 0.46);
  }

  clampInBounds(x, z, margin = 0.5) {
    const half = this.getBoundsHalf() - margin;
    return {
      x: Math.max(-half, Math.min(half, x)),
      z: Math.max(-half, Math.min(half, z)),
      hitEdge:
        x <= -half + 0.01 || x >= half - 0.01 || z <= -half + 0.01 || z >= half - 0.01,
    };
  }

  isNearBounds(x, z, pad = 3) {
    const half = this.getBoundsHalf();
    return Math.abs(x) > half - pad || Math.abs(z) > half - pad;
  }

  resolveCircleMove(px, pz, nx, nz, radius) {
    let x = nx;
    let z = nz;
    for (const c of this.colliders) {
      const dx = x - c.x;
      const dz = z - c.z;
      const dist = Math.hypot(dx, dz);
      const min = c.r + radius;
      if (dist < min && dist > 0.0001) {
        const push = (min - dist) / dist;
        x += dx * push;
        z += dz * push;
      }
    }
    const c = this.clampInBounds(x, z, radius);
    return { x: c.x, z: c.z, hitEdge: c.hitEdge };
  }

  spawnNightMonsters() {
    for (let i = 0; i < 2; i++) this._trySpawn('shadow', 12);
  }

  _dist(px, pz, e) {
    return Math.hypot(e.x - px, e.z - pz);
  }

  _wrapTarget(e, dist, kind) {
    return { entity: e, type: e.type, def: e.def, hp: e.hp, maxHp: e.maxHp, dist, kind };
  }

  getAttackTarget(px, pz, range, isNight) {
    let hostile = null;
    let hostileD = range;
    let passive = null;
    let passiveD = range;
    for (const e of this.entities) {
      if (e.dead) continue;
      const d = this._dist(px, pz, e);
      if (d >= range) continue;
      const c = CREATURES[e.type];
      if (c?.hostile && !(c.nightOnly && !isNight)) {
        if (d < hostileD) { hostileD = d; hostile = e; }
      } else if (e.passive && d < passiveD) {
        passiveD = d; passive = e;
      }
    }
    if (hostile) return this._wrapTarget(hostile, hostileD, 'hostile');
    if (passive) return this._wrapTarget(passive, passiveD, 'passive');
    return null;
  }

  getInteractable(px, pz, range) {
    let best = null;
    let bestD = range;
    for (const e of this.entities) {
      if (e.dead || !RESOURCES[e.type]) continue;
      const d = this._dist(px, pz, e);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best ? this._wrapTarget(best, bestD, 'resource') : null;
  }

  getCatchable(px, pz, range, hpRatio) {
    let best = null;
    let bestD = range;
    const closeDist = CFG.player.catchCloseDist ?? 4.5;
    const closeRatio = CFG.player.catchCloseHpRatio ?? 0.72;
    for (const e of this.entities) {
      if (e.dead || !e.passive) continue;
      const d = this._dist(px, pz, e);
      if (d >= range) continue;
      const hpOk = e.hp <= e.maxHp * hpRatio;
      const closeOk = d <= closeDist && e.hp <= e.maxHp * closeRatio;
      if (!hpOk && !closeOk) continue;
      if (d < bestD) { bestD = d; best = e; }
    }
    return best ? this._wrapTarget(best, bestD, 'catch') : null;
  }

  getNearestBush(px, pz, range) {
    let best = null;
    let bestD = range;
    for (const e of this.entities) {
      if (e.dead || e.type !== 'bush') continue;
      const d = this._dist(px, pz, e);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best ? this._wrapTarget(best, bestD, 'resource') : null;
  }

  getFocusTarget(px, pz, interactRange, attackRange, isNight) {
    const catchT = this.getCatchable(px, pz, CFG.player.catchRange, CFG.player.catchHpRatio);
    const attack = this.getAttackTarget(px, pz, attackRange, isNight);
    const interact = this.getInteractable(px, pz, interactRange);
    if (catchT) return catchT;
    if (attack && attack.dist < 3.2) return attack;
    if (interact) return interact;
    if (attack) return attack;
    return null;
  }
}
