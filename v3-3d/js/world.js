import * as THREE from 'three';
import { CFG, RESOURCES, CREATURES } from './config.js';
import { HeightField, terrainHeight } from './terrain.js';

const shared = {
  trunkGeo: new THREE.CylinderGeometry(0.22, 0.3, 2, 5),
  crownGeo: new THREE.ConeGeometry(1.1, 2.4, 5),
  rockGeo: new THREE.DodecahedronGeometry(0.75, 0),
  bushGeo: new THREE.SphereGeometry(0.55, 5, 5),
  bodyGeo: new THREE.BoxGeometry(1, 0.75, 1.5),
  trunkMat: new THREE.MeshLambertMaterial({ color: 0x5c4033 }),
  crownMat: new THREE.MeshLambertMaterial({ color: 0x2d6a3e }),
  rockMat: new THREE.MeshLambertMaterial({ color: 0x6c757d }),
  bushMat: new THREE.MeshLambertMaterial({ color: 0x40916c }),
};

const creatureMats = new Map();
function getCreatureMat(color) {
  if (!creatureMats.has(color)) {
    creatureMats.set(color, new THREE.MeshLambertMaterial({ color }));
  }
  return creatureMats.get(color);
}

export class World3D {
  constructor(scene) {
    this.scene = scene;
    this.size = CFG.worldSize;
    this.entities = [];
    this.colliders = [];
    this.heightField = null;
  }

  generate() {
    const seg = CFG.terrainSegments;
    this.heightField = new HeightField(this.size, seg);

    const groundGeo = new THREE.PlaneGeometry(this.size, this.size, seg, seg);
    const pos = groundGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      pos.setZ(i, terrainHeight(x, y));
    }
    groundGeo.computeVertexNormals();

    const ground = new THREE.Mesh(
      groundGeo,
      new THREE.MeshLambertMaterial({ color: 0x3d5a3c, flatShading: true })
    );
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);
    this.ground = ground;

    const place = (type, count) => {
      for (let i = 0; i < count; i++) this._trySpawn(type, 24);
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
      if (RESOURCES[type]) {
        this.colliders.push({ x, z, r: def.radius || 1 });
      }
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
    const group = new THREE.Group();
    group.position.set(x, y, z);

    if (type === 'tree') {
      const trunk = new THREE.Mesh(shared.trunkGeo, shared.trunkMat);
      trunk.position.y = 1;
      const crown = new THREE.Mesh(shared.crownGeo, shared.crownMat);
      crown.position.y = 2.8;
      group.add(trunk, crown);
    } else if (type === 'rock') {
      const m = new THREE.Mesh(shared.rockGeo, shared.rockMat);
      m.position.y = 0.45;
      group.add(m);
    } else if (type === 'bush') {
      const m = new THREE.Mesh(shared.bushGeo, shared.bushMat);
      m.position.y = 0.4;
      group.add(m);
    } else {
      const body = new THREE.Mesh(shared.bodyGeo, getCreatureMat(def.color));
      body.position.y = 0.55;
      group.add(body);
    }

    this.scene.add(group);
    return {
      id: crypto.randomUUID(),
      type,
      mesh: group,
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
    };
  }

  getHeightAt(x, z) {
    return this.heightField?.sample(x, z) ?? terrainHeight(x, z);
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
    const half = this.size * 0.46;
    x = Math.max(-half, Math.min(half, x));
    z = Math.max(-half, Math.min(half, z));
    return { x, z };
  }

  spawnNightMonsters() {
    for (let i = 0; i < 3; i++) this._trySpawn('shadow', 16);
  }

  getInteractable(px, pz, range) {
    let best = null;
    let bestD = range;
    for (const e of this.entities) {
      if (e.dead || !RESOURCES[e.type]) continue;
      const d = Math.hypot(e.x - px, e.z - pz);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  _dist(px, pz, e) {
    return Math.hypot(e.x - px, e.z - pz);
  }

  _wrapTarget(e, dist, kind) {
    return { entity: e, type: e.type, def: e.def, hp: e.hp, maxHp: e.maxHp, dist, kind };
  }

  /** 攻击优先：敌对 > 可狩猎 > 资源 */
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
        if (d < hostileD) {
          hostileD = d;
          hostile = e;
        }
      } else if (e.passive && d < passiveD) {
        passiveD = d;
        passive = e;
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
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best ? this._wrapTarget(best, bestD, 'resource') : null;
  }

  getCatchable(px, pz, range, hpRatio) {
    let best = null;
    let bestD = range;
    for (const e of this.entities) {
      if (e.dead || !e.passive) continue;
      if (e.hp > e.maxHp * hpRatio) continue;
      const d = this._dist(px, pz, e);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best ? this._wrapTarget(best, bestD, 'catch') : null;
  }

  getNearestBush(px, pz, range) {
    let best = null;
    let bestD = range;
    for (const e of this.entities) {
      if (e.dead || e.type !== 'bush') continue;
      const d = this._dist(px, pz, e);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best ? this._wrapTarget(best, bestD, 'resource') : null;
  }

  /** UI 用：最近可交互/可攻击目标 */
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
