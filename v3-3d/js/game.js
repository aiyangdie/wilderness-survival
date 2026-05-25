import * as THREE from 'three';
import { CFG, CREATURES, RESOURCES } from './config.js';
import { HumanCharacter } from './human.js';
import { World3D } from './world.js';

export class Game3D {
  constructor() {
    this.clock = new THREE.Clock();
    this.keys = new Set();
    this.mouseLocked = false;
    this.yaw = 0;
    this.pitch = 0;
    this.running = false;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog = new THREE.Fog(0x87ceeb, 40, 120);

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 300);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(this.renderer.domElement);

    this.sun = new THREE.DirectionalLight(0xfff5e6, 1.2);
    this.sun.position.set(40, 60, 30);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 0.5;
    this.sun.shadow.camera.far = 150;
    this.sun.shadow.camera.left = -60;
    this.sun.shadow.camera.right = 60;
    this.sun.shadow.camera.top = 60;
    this.sun.shadow.camera.bottom = -60;
    this.scene.add(this.sun);
    this.scene.add(new THREE.AmbientLight(0x6688aa, 0.45));
    this.scene.add(new THREE.HemisphereLight(0x87ceeb, 0x3d5a3c, 0.35));

    this.world = new World3D(this.scene);
    this.human = new HumanCharacter();
    this.scene.add(this.human.group);

    this.player = {
      x: 0,
      y: 0,
      z: 0,
      vy: 0,
      onGround: true,
      health: 100,
      hunger: 100,
      thirst: 100,
      stamina: 100,
      score: 0,
      invuln: 0,
      attackCd: 0,
      alive: true,
    };
    this.inventory = { wood: 5, fiber: 3, meat: 0, stone: 0 };
    this.day = 1;
    this.time = 0;
    this.phase = 'day';
    this.nightSpawned = false;

    this.ui = {
      start: document.getElementById('overlay-start'),
      dead: document.getElementById('overlay-dead'),
      hint: document.getElementById('hint'),
      toast: document.getElementById('toast'),
    };

    this._bindEvents();
    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  _bindEvents() {
    window.addEventListener('keydown', (e) => this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    document.addEventListener('mousemove', (e) => {
      if (!this.mouseLocked) return;
      this.yaw -= e.movementX * 0.002;
      this.pitch = Math.max(-0.6, Math.min(0.6, this.pitch - e.movementY * 0.002));
    });
    document.addEventListener('mousedown', (e) => {
      if (e.button === 0 && this.mouseLocked && this.running) this._attack();
    });
    document.addEventListener('pointerlockchange', () => {
      this.mouseLocked = document.pointerLockElement === document.body;
    });
    document.getElementById('btn-start').onclick = () => this.start();
    document.getElementById('btn-restart').onclick = () => this.start();
  }

  start() {
    const keepTypes = new Set(['AmbientLight', 'HemisphereLight', 'DirectionalLight']);
    [...this.scene.children].forEach((c) => {
      if (!keepTypes.has(c.type) && c !== this.sun) this.scene.remove(c);
    });
    this.world = new World3D(this.scene);
    this.world.generate();
    this.human = new HumanCharacter();
    this.scene.add(this.human.group);

    this.player = {
      x: 0,
      y: this.world.getHeightAt(0, 0),
      z: 0,
      vy: 0,
      onGround: true,
      health: 100,
      hunger: 100,
      thirst: 100,
      stamina: 100,
      score: 0,
      invuln: 0,
      attackCd: 0,
      alive: true,
    };
    this.inventory = { wood: 5, fiber: 3 };
    this.day = 1;
    this.time = 0;
    this.phase = 'day';
    this.nightSpawned = false;
    this.yaw = 0;
    this.pitch = 0.2;

    this.ui.start.classList.remove('show');
    this.ui.dead.classList.remove('show');
    this.running = true;
    document.body.requestPointerLock();
    this._toast('3D 荒野生存开始！夜晚前准备好武器。');
    this._loop();
  }

  _loop() {
    if (!this.running) return;
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this._update(dt);
    this._render();
    requestAnimationFrame(() => this._loop());
  }

  _update(dt) {
    const p = this.player;
    if (!p.alive) return;

    this._updateTime(dt);
    this._updatePlayer(dt);
    this._updateEntities(dt);
    this._updateLighting();

    p.hunger = Math.max(0, p.hunger - CFG.decay.hunger * dt);
    p.thirst = Math.max(0, p.thirst - CFG.decay.thirst * dt);
    if (p.hunger <= 0 || p.thirst <= 0) p.health = Math.max(0, p.health - 6 * dt);
    if (p.invuln > 0) p.invuln -= dt;
    if (p.attackCd > 0) p.attackCd -= dt;

    if (this.keys.has('KeyE')) this._interact();

    if (p.health <= 0) {
      p.alive = false;
      this.running = false;
      document.exitPointerLock();
      this.ui.dead.classList.add('show');
      document.getElementById('dead-day').textContent = String(this.day);
      document.getElementById('dead-score').textContent = String(p.score);
    }

    this._updateHUD();
  }

  _updatePlayer(dt) {
    const p = this.player;
    const run = this.keys.has('ShiftLeft') && p.stamina > 8;
    const speed = run ? CFG.player.runSpeed : CFG.player.walkSpeed;
    if (run) p.stamina = Math.max(0, p.stamina - 25 * dt);
    else p.stamina = Math.min(100, p.stamina + 18 * dt);

    let mx = 0;
    let mz = 0;
    if (this.keys.has('KeyW')) mz -= 1;
    if (this.keys.has('KeyS')) mz += 1;
    if (this.keys.has('KeyA')) mx -= 1;
    if (this.keys.has('KeyD')) mx += 1;

    if (mx !== 0 || mz !== 0) {
      const len = Math.hypot(mx, mz);
      mx /= len;
      mz /= len;
      const sin = Math.sin(this.yaw);
      const cos = Math.cos(this.yaw);
      const dx = mx * cos - mz * sin;
      const dz = mx * sin + mz * cos;
      p.x += dx * speed * dt;
      p.z += dz * speed * dt;
      this.human.setRotationY(Math.atan2(dx, dz));
    }

    const half = this.world.size * 0.45;
    p.x = Math.max(-half, Math.min(half, p.x));
    p.z = Math.max(-half, Math.min(half, p.z));

    p.y = this.world.getHeightAt(p.x, p.z);
    if (this.keys.has('Space') && p.onGround) {
      p.vy = CFG.player.jumpForce;
      p.onGround = false;
    }
    if (!p.onGround) {
      p.vy -= CFG.player.gravity * dt;
      p.y += p.vy * dt;
      const ground = this.world.getHeightAt(p.x, p.z);
      if (p.y <= ground) {
        p.y = ground;
        p.vy = 0;
        p.onGround = true;
      }
    }

    this.human.setPosition(p.x, p.y, p.z);
    const moveSpeed = (mx !== 0 || mz !== 0) ? speed : 0;
    this.human.update(dt, moveSpeed, p.onGround, p.attackCd > CFG.player.attackDamage * 0.01 && p.attackCd > 0.35);
  }

  _updateEntities(dt) {
    const p = this.player;
    const isNight = this.phase === 'night';

    if (isNight && !this.nightSpawned) {
      this.world.spawnNightMonsters();
      this.nightSpawned = true;
      this._toast('夜晚降临！暗影怪物出现了！');
    }

    for (const e of this.world.entities) {
      if (e.dead) continue;
      const def = e.def;
      const dx = p.x - e.x;
      const dz = p.z - e.z;
      const dist = Math.hypot(dx, dz);

      if (e.passive) {
        if (dist < 12) {
          e.x -= (dx / dist) * def.speed * dt * 0.5;
          e.z -= (dz / dist) * def.speed * dt * 0.5;
        }
      } else if (CREATURES[e.type]) {
        if (def.nightOnly && !isNight) continue;
        if (dist < (def.aggro || 20)) {
          e.x += (dx / dist) * def.speed * dt;
          e.z += (dz / dist) * def.speed * dt;
          if (dist < 2.2 && p.invuln <= 0) {
            p.health -= (def.damage || 10) * dt * 2;
            p.invuln = 0.35;
          }
        }
      }

      e.mesh.position.x = e.x;
      e.mesh.position.z = e.z;
      e.mesh.position.y = this.world.getHeightAt(e.x, e.z);
      if (e.passive || CREATURES[e.type]) {
        e.mesh.lookAt(p.x, e.mesh.position.y, p.z);
      }
    }

    this.world.entities = this.world.entities.filter((e) => !e.dead);
  }

  _attack() {
    const p = this.player;
    if (p.attackCd > 0) return;
    p.attackCd = 0.45;
    p.score += 1;

    let best = null;
    let bestD = CFG.player.attackRange;
    for (const e of this.world.entities) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - p.x, e.z - p.z);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    if (!best) return;

    best.hp -= CFG.player.attackDamage;
    if (best.hp <= 0) {
      best.dead = true;
      this.scene.remove(best.mesh);
      const drop = best.def?.drop || {};
      for (const [k, v] of Object.entries(drop)) {
        this.inventory[k] = (this.inventory[k] || 0) + v;
      }
      p.score += best.type === 'shadow' ? 35 : best.type === 'wolf' ? 22 : 10;
      this._toast(`击败了 ${best.type}`);
    }
  }

  _interact() {
    if (this._interactLock) return;
    this._interactLock = true;
    setTimeout(() => (this._interactLock = false), 400);

    const p = this.player;
    let near = null;
    let nearD = 3.5;
    for (const e of this.world.entities) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - p.x, e.z - p.z);
      if (d < nearD && RESOURCES[e.type]) {
        nearD = d;
        near = e;
      }
    }
    if (near) {
      near.hp -= 15;
      if (near.hp <= 0) {
        near.dead = true;
        this.scene.remove(near.mesh);
        const drop = near.def?.drop || {};
        for (const [k, v] of Object.entries(drop)) {
          this.inventory[k] = (this.inventory[k] || 0) + v;
        }
        p.score += 8;
        this._toast('采集成功');
      }
      return;
    }

    if (this.inventory.meat > 0) {
      this.inventory.meat--;
      p.hunger = Math.min(100, p.hunger + 30);
      p.health = Math.min(100, p.health + 8);
      this._toast('食用生肉');
    }
  }

  _updateTime(dt) {
    this.time += dt / CFG.daySeconds;
    if (this.time >= 1) {
      this.time = 0;
      this.day++;
      this.player.score += 50;
      this.nightSpawned = false;
      this._toast(`第 ${this.day} 天`);
    }
    if (this.time < 0.2) this.phase = 'dawn';
    else if (this.time < 0.55) this.phase = 'day';
    else if (this.time < 0.75) this.phase = 'dusk';
    else this.phase = 'night';
  }

  _updateLighting() {
    const t = this.time;
    let sunY = 50;
    let sunInt = 1.2;
    let bg = 0x87ceeb;
    let fog = 0x87ceeb;

    if (this.phase === 'night') {
      sunY = 8;
      sunInt = 0.15;
      bg = 0x0a1020;
      fog = 0x0a1020;
    } else if (this.phase === 'dusk') {
      sunY = 15;
      sunInt = 0.5;
      bg = 0xc45c26;
      fog = 0x8b4513;
    } else if (this.phase === 'dawn') {
      sunY = 20;
      sunInt = 0.7;
      bg = 0xf4a460;
      fog = 0xf4a460;
    }

    this.sun.position.y = sunY;
    this.sun.intensity = sunInt;
    this.scene.background.setHex(bg);
    this.scene.fog.color.setHex(fog);
  }

  _render() {
    const p = this.player;
    const camDist = 7;
    const camH = 3.2;
    const cx = p.x - Math.sin(this.yaw) * camDist;
    const cz = p.z - Math.cos(this.yaw) * camDist;
    const cy = p.y + camH + this.pitch * 2;
    this.camera.position.lerp(new THREE.Vector3(cx, cy, cz), 0.12);
    this.camera.lookAt(p.x, p.y + 1.5, p.z);
    this.sun.position.x = p.x + 30;
    this.sun.position.z = p.z + 20;
    this.renderer.render(this.scene, this.camera);
  }

  _resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  _updateHUD() {
    const p = this.player;
    const phaseLabel = { dawn: '🌅 清晨', day: '☀️ 白天', dusk: '🌇 黄昏', night: '🌙 夜晚' };
    document.getElementById('h-health').textContent = `❤️ ${Math.ceil(p.health)}`;
    document.getElementById('h-hunger').textContent = `🍖 ${Math.ceil(p.hunger)}`;
    document.getElementById('h-thirst').textContent = `💧 ${Math.ceil(p.thirst)}`;
    document.getElementById('h-stamina').textContent = `⚡ ${Math.ceil(p.stamina)}`;
    document.getElementById('h-day').textContent = `📅 第 ${this.day} 天`;
    document.getElementById('h-time').textContent = phaseLabel[this.phase] || '';
    document.getElementById('h-score').textContent = `⭐ ${p.score}`;
    const inv = Object.entries(this.inventory).filter(([, v]) => v > 0).map(([k, v]) => `${k}×${v}`).join(' ');
    this.ui.hint.textContent = inv ? `资源: ${inv} · E 采集/食用` : 'WASD 移动 · 左键攻击 · E 采集';
  }

  _toast(msg) {
    const el = this.ui.toast;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 2200);
  }
}
