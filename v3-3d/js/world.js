import * as THREE from 'three';
import { CFG, RESOURCES, CREATURES } from './config.js';
import { HeightField, terrainHeight } from './terrain.js';
import { createCreatureVisual } from './creatures.js';

function stdMat(color, rough = 0.88, metal = 0.02, emissive = 0x000000, emInt = 0) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: rough,
    metalness: metal,
    emissive,
    emissiveIntensity: emInt,
    flatShading: false,
  });
}

const shared = {
  trunkGeo: new THREE.CylinderGeometry(0.22, 0.32, 2, 6),
  crownGeo: new THREE.ConeGeometry(1.1, 2.5, 8),
  rockGeo: new THREE.DodecahedronGeometry(0.75, 1),
  bushGeo: new THREE.SphereGeometry(0.55, 6, 5),
  trunkMat: stdMat(0x5c4030, 0.95),
  crownMat: stdMat(0x3d8f48, 0.82),
  crownMat2: stdMat(0x52a85c, 0.78),
  rockMat: stdMat(0x7a858f, 0.75, 0.05),
  bushMat: stdMat(0x48a868, 0.85),
  bushFlower: stdMat(0x7acc6a, 0.9),
};

/** InstancedMesh 批量渲染，极大减少 draw call */
class PropBatch {
  constructor(scene, geo, mat, max) {
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.max = max;
    this.count = 0;
    this._dirty = false;
    this._dummy = new THREE.Object3D();
    this._hidden = new THREE.Vector3(0, -999, 0);
  }

  _markDirty() {
    this._dirty = true;
  }

  flush() {
    if (!this._dirty) return;
    this.mesh.instanceMatrix.needsUpdate = true;
    this._dirty = false;
  }

  add(x, y, z, sy = 1) {
    if (this.count >= this.max) return -1;
    const i = this.count++;
    this._set(i, x, y, z, sy);
    this.mesh.count = this.count;
    this._markDirty();
    return i;
  }

  setAt(i, x, y, z, sy = 1) {
    if (i >= this.max) return;
    this._set(i, x, y, z, sy);
    if (i >= this.count) {
      this.count = i + 1;
      this.mesh.count = this.count;
    }
    this._markDirty();
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
    this._markDirty();
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

    const colors = new Float32Array(pos.count * 3);
    const cLow = new THREE.Color(0x5a9048);
    const cHigh = new THREE.Color(0x8ec878);
    const cDirt = new THREE.Color(0x7a6a48);
    for (let i = 0; i < pos.count; i++) {
      const h = pos.getZ(i);
      const t = Math.max(0, Math.min(1, (h + 1.5) / 3.2));
      const col = cLow.clone().lerp(cHigh, t);
      if (t < 0.35) col.lerp(cDirt, 0.35 - t);
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }
    groundGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const ground = new THREE.Mesh(
      groundGeo,
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.92,
        metalness: 0,
      })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = false;
    this.scene.add(ground);
    this.ground = ground;

    const half = this.getBoundsHalf() - 1;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(half - 1.2, half, 48),
      new THREE.MeshBasicMaterial({
        color: 0x9ae878,
        transparent: true,
        opacity: 0.55,
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
      this.batches.trunk.setAt(batchIdx, x, y + 1, z, 0.92 + Math.random() * 0.2);
      this.batches.crown.setAt(batchIdx, x, y + 2.85, z, 0.88 + Math.random() * 0.28);
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

  resolveCircleMove(px, pz, nx, nz, radius, colliders = null) {
    let x = nx;
    let z = nz;
    const list = colliders ?? this.colliders;
    for (const c of list) {
      const dx = x - c.x;
      const dz = z - c.z;
      const distSq = dx * dx + dz * dz;
      const min = c.r + radius;
      const minSq = min * min;
      if (distSq < minSq && distSq > 0.0000001) {
        const dist = Math.sqrt(distSq);
        const push = (min - dist) / dist;
        x += dx * push;
        z += dz * push;
      }
    }
    const c = this.clampInBounds(x, z, radius);
    return { x: c.x, z: c.z, hitEdge: c.hitEdge };
  }

  /** 只检测玩家附近的碰撞体，避免每帧遍历全部树木 */
  getNearbyColliders(px, pz, pad = 11) {
    const moved = Math.abs(px - (this._ccX ?? 9999)) > 3 || Math.abs(pz - (this._ccZ ?? 9999)) > 3;
    if (!moved && this._colliderCache) return this._colliderCache;

    this._ccX = px;
    this._ccZ = pz;
    const out = [];
    for (const c of this.colliders) {
      const dx = Math.abs(c.x - px);
      const dz = Math.abs(c.z - pz);
      if (dx + dz < pad + c.r + 1.5) out.push(c);
    }
    this._colliderCache = out;
    return out;
  }

  invalidateColliderCache() {
    this._colliderCache = null;
  }

  flushPropBatches() {
    for (const b of Object.values(this.batches)) b.flush();
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
    const catchRange = CFG.player.catchRange;
    const catchHpRatio = CFG.player.catchHpRatio;
    const closeDist = CFG.player.catchCloseDist ?? 4.5;
    const closeRatio = CFG.player.catchCloseHpRatio ?? 0.72;
    const maxRange = Math.max(interactRange, attackRange, catchRange);
    const maxRangeSq = maxRange * maxRange;

    let catchT = null;
    let catchD = catchRange;
    let hostile = null;
    let hostileD = attackRange;
    let passive = null;
    let passiveD = attackRange;
    let interact = null;
    let interactD = interactRange;

    for (const e of this.entities) {
      if (e.dead) continue;
      const dx = e.x - px;
      const dz = e.z - pz;
      const distSq = dx * dx + dz * dz;
      if (distSq >= maxRangeSq) continue;
      const d = Math.sqrt(distSq);

      if (e.passive && d < catchD) {
        const hpOk = e.hp <= e.maxHp * catchHpRatio;
        const closeOk = d <= closeDist && e.hp <= e.maxHp * closeRatio;
        if (hpOk || closeOk) {
          catchD = d;
          catchT = e;
        }
      }

      if (d < attackRange) {
        const c = CREATURES[e.type];
        if (c?.hostile && !(c.nightOnly && !isNight)) {
          if (d < hostileD) {
            hostileD = d;
            hostile = e;
          }
        } else if (e.passive && d < passiveD) {
          passiveD = d;
          passive = e;
        }
      }

      if (RESOURCES[e.type] && d < interactD) {
        interactD = d;
        interact = e;
      }
    }

    if (catchT) return this._wrapTarget(catchT, catchD, 'catch');
    if (hostile) {
      const ht = this._wrapTarget(hostile, hostileD, 'hostile');
      if (hostileD < 3.2) return ht;
      if (interact) return this._wrapTarget(interact, interactD, 'resource');
      return ht;
    }
    if (interact) return this._wrapTarget(interact, interactD, 'resource');
    if (passive) return this._wrapTarget(passive, passiveD, 'passive');
    return null;
  }
}
