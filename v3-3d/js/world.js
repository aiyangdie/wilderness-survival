import * as THREE from 'three';
import { CFG, RESOURCES, CREATURES } from './config.js';

export class World3D {
  constructor(scene) {
    this.scene = scene;
    this.size = CFG.worldSize;
    this.entities = [];
    this.obstacles = [];
  }

  generate() {
    const groundGeo = new THREE.PlaneGeometry(this.size, this.size, 32, 32);
    const pos = groundGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const h = (Math.sin(x * 0.08) + Math.cos(y * 0.07)) * 1.2 + Math.random() * 0.3;
      pos.setZ(i, h);
    }
    groundGeo.computeVertexNormals();
    const ground = new THREE.Mesh(
      groundGeo,
      new THREE.MeshStandardMaterial({ color: 0x3d5a3c, roughness: 0.95, flatShading: true })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.ground = ground;

    const place = (type, count) => {
      for (let i = 0; i < count; i++) {
        const x = (Math.random() - 0.5) * this.size * 0.85;
        const z = (Math.random() - 0.5) * this.size * 0.85;
        this.entities.push(this._createResource(type, x, z));
      }
    };
    place('tree', 120);
    place('rock', 35);
    place('bush', 50);
    place('deer', 10);
    place('rabbit', 14);
    place('wolf', 5);
  }

  _createResource(type, x, z) {
    const def = RESOURCES[type] || CREATURES[type];
    const group = new THREE.Group();
    group.position.set(x, this.getHeightAt(x, z), z);

    if (type === 'tree') {
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.35, 2.2, 8),
        new THREE.MeshStandardMaterial({ color: 0x5c4033 })
      );
      trunk.position.y = 1.1;
      trunk.castShadow = true;
      const crown = new THREE.Mesh(
        new THREE.ConeGeometry(1.4, 2.8, 8),
        new THREE.MeshStandardMaterial({ color: 0x2d6a3e })
      );
      crown.position.y = 3.2;
      crown.castShadow = true;
      group.add(trunk, crown);
      this.obstacles.push({ x, z, r: 1.2 });
    } else if (type === 'rock') {
      const m = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.9, 0),
        new THREE.MeshStandardMaterial({ color: def.color })
      );
      m.position.y = 0.5;
      m.castShadow = true;
      group.add(m);
      this.obstacles.push({ x, z, r: 1 });
    } else if (type === 'bush') {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.7, 8, 8),
        new THREE.MeshStandardMaterial({ color: def.color })
      );
      m.position.y = 0.5;
      group.add(m);
    } else {
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.9, 1.8),
        new THREE.MeshStandardMaterial({ color: def.color })
      );
      body.position.y = 0.6;
      body.castShadow = true;
      group.add(body);
      if (type === 'wolf' || type === 'shadow') {
        const eye = new THREE.Mesh(
          new THREE.SphereGeometry(0.08),
          new THREE.MeshBasicMaterial({ color: 0xff2222 })
        );
        eye.position.set(0, 0.9, 0.9);
        group.add(eye);
      }
    }

    this.scene.add(group);
    return {
      id: crypto.randomUUID(),
      type,
      mesh: group,
      x,
      z,
      hp: def.hp,
      maxHp: def.hp,
      def,
      dead: false,
      passive: !!def.passive,
      vx: 0,
      vz: 0,
    };
  }

  getHeightAt(x, z) {
    const ray = new THREE.Raycaster(new THREE.Vector3(x, 50, z), new THREE.Vector3(0, -1, 0));
    const hits = ray.intersectObject(this.ground);
    return hits[0]?.point.y ?? 0;
  }

  spawnNightMonsters() {
    for (let i = 0; i < 4 + Math.floor(Math.random() * 3); i++) {
      const x = (Math.random() - 0.5) * this.size * 0.7;
      const z = (Math.random() - 0.5) * this.size * 0.7;
      this.entities.push(this._createResource('shadow', x, z));
    }
  }
}
