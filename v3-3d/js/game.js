import * as THREE from 'three';
import { CFG, CREATURES, RESOURCES } from './config.js';
import { HumanCharacter } from './human.js';
import { World3D } from './world.js';

export class Game3D {
  constructor() {
    this.clock = new THREE.Clock();
    this.keys = new Set();
    this.keysJust = new Set();
    this.mouseLocked = false;
    this.yaw = 0;
    this.pitch = 0.25;
    this.running = false;
    this.rafId = 0;
    this.interactCooldown = 0;
    this.hudTimer = 0;
    this.isAttacking = false;
    this.attackAnimTimer = 0;

    this._camPos = new THREE.Vector3();
    this._camTarget = new THREE.Vector3();
    this._camDesired = new THREE.Vector3();
    this._moveDir = new THREE.Vector3();
    this._forward = new THREE.Vector3();
    this._right = new THREE.Vector3();

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog = new THREE.Fog(0x87ceeb, 50, 140);

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.2, 250);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(this.renderer.domElement);
    this.canvas = this.renderer.domElement;

    this.sun = new THREE.DirectionalLight(0xfff5e6, 1.1);
    this.sun.position.set(40, 55, 30);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.bias = -0.0002;
    const sc = this.sun.shadow.camera;
    sc.near = 1;
    sc.far = 120;
    sc.left = sc.bottom = -45;
    sc.right = sc.top = 45;
    this.sun.target = new THREE.Object3D();
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.scene.add(new THREE.AmbientLight(0x8899aa, 0.5));
    this.scene.add(new THREE.HemisphereLight(0x87ceeb, 0x3d5a3c, 0.3));

    this.world = null;
    this.human = null;
    this.player = this._newPlayer();
    this.inventory = { wood: 5, fiber: 3 };
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

  _newPlayer() {
    return {
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
  }

  _bindEvents() {
    window.addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) this.keysJust.add(e.code);
      this.keys.add(e.code);
      if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));

    this.canvas.addEventListener('mousemove', (e) => {
      if (!this.mouseLocked || !this.running) return;
      this.yaw -= e.movementX * 0.0022;
      this.pitch = Math.max(-0.45, Math.min(0.55, this.pitch - e.movementY * 0.0022));
    });

    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (!this.running) return;
      if (!this.mouseLocked) {
        this.canvas.requestPointerLock();
        return;
      }
      this._attack();
    });

    document.addEventListener('pointerlockchange', () => {
      this.mouseLocked = document.pointerLockElement === this.canvas;
      this.ui.hint.textContent = this.mouseLocked
        ? 'WASD 移动 · 左键攻击 · E 采集'
        : '点击画面锁定鼠标 · Esc 释放';
    });

    document.getElementById('btn-start').onclick = () => this.start();
    document.getElementById('btn-restart').onclick = () => this.start();
  }

  start() {
    if (this.rafId) cancelAnimationFrame(this.rafId);

    const keepTypes = new Set(['AmbientLight', 'HemisphereLight', 'DirectionalLight']);
    [...this.scene.children].forEach((c) => {
      if (!keepTypes.has(c.type) && c !== this.sun) this.scene.remove(c);
    });

    this.world = new World3D(this.scene);
    this.world.generate();
    this.human = new HumanCharacter();
    this.scene.add(this.human.group);

    const spawnY = this.world.getHeightAt(0, 0);
    this.player = this._newPlayer();
    this.player.x = 0;
    this.player.z = 0;
    this.player.y = spawnY;
    this.inventory = { wood: 5, fiber: 3 };
    this.day = 1;
    this.time = 0;
    this.phase = 'day';
    this.nightSpawned = false;
    this.yaw = 0;
    this.pitch = 0.25;
    this.interactCooldown = 0;
    this.clock.getDelta();

    this.ui.start.classList.remove('show');
    this.ui.dead.classList.remove('show');
    this.running = true;
    this.canvas.requestPointerLock();
    this._toast('3D 荒野生存 — 点击画面开始操作');
    this._loop();
  }

  _loop() {
    if (!this.running) return;
    const dt = Math.min(this.clock.getDelta(), 1 / 30);
    this._update(dt);
    this._render();
    this.keysJust.clear();
    this.rafId = requestAnimationFrame(() => this._loop());
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
    if (p.hunger <= 0 || p.thirst <= 0) p.health = Math.max(0, p.health - 5 * dt);
    if (p.invuln > 0) p.invuln -= dt;
    if (p.attackCd > 0) p.attackCd -= dt;
    if (this.interactCooldown > 0) this.interactCooldown -= dt;
    if (this.attackAnimTimer > 0) {
      this.attackAnimTimer -= dt;
      if (this.attackAnimTimer <= 0) this.isAttacking = false;
    }

    if (this.keysJust.has('KeyE')) this._interact();

    if (p.health <= 0) this._gameOver();

    this.hudTimer += dt;
    if (this.hudTimer >= 0.1) {
      this.hudTimer = 0;
      this._updateHUD();
    }
  }

  _updatePlayer(dt) {
    const p = this.player;
    const run = (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) && p.stamina > 10;
    const speed = run ? CFG.player.runSpeed : CFG.player.walkSpeed;
    if (run) p.stamina = Math.max(0, p.stamina - 20 * dt);
    else p.stamina = Math.min(100, p.stamina + 20 * dt);

    this._forward.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this._right.set(this._forward.z, 0, -this._forward.x);

    this._moveDir.set(0, 0, 0);
    if (this.keys.has('KeyW')) this._moveDir.add(this._forward);
    if (this.keys.has('KeyS')) this._moveDir.sub(this._forward);
    if (this.keys.has('KeyA')) this._moveDir.sub(this._right);
    if (this.keys.has('KeyD')) this._moveDir.add(this._right);

    let moving = false;
    if (this._moveDir.lengthSq() > 0.0001) {
      this._moveDir.normalize();
      const nx = p.x + this._moveDir.x * speed * dt;
      const nz = p.z + this._moveDir.z * speed * dt;
      const resolved = this.world.resolveCircleMove(p.x, p.z, nx, nz, 0.55);
      p.x = resolved.x;
      p.z = resolved.z;
      this.human.setRotationY(Math.atan2(this._moveDir.x, this._moveDir.z));
      moving = true;
    }

    const groundY = this.world.getHeightAt(p.x, p.z);

    if (this.keysJust.has('Space') && p.onGround) {
      p.vy = CFG.player.jumpForce;
      p.onGround = false;
    }

    if (!p.onGround) {
      p.vy -= CFG.player.gravity * dt;
      p.y += p.vy * dt;
      if (p.y <= groundY) {
        p.y = groundY;
        p.vy = 0;
        p.onGround = true;
      }
    } else {
      p.y = groundY;
    }

    this.human.setPosition(p.x, p.y, p.z);
    this.human.update(dt, moving ? speed : 0, p.onGround, this.isAttacking);
  }

  _updateEntities(dt) {
    const p = this.player;
    const isNight = this.phase === 'night';
    const cull = CFG.entityCullDist;

    if (isNight && !this.nightSpawned) {
      this.world.spawnNightMonsters();
      this.nightSpawned = true;
      this._toast('夜晚降临！暗影怪物出现了！');
    }

    for (const e of this.world.entities) {
      if (e.dead) continue;

      const dx = p.x - e.x;
      const dz = p.z - e.z;
      const dist = Math.hypot(dx, dz);
      if (dist > cull) continue;

      const def = e.def;

      if (e.passive && dist > 0.5) {
        if (dist < 14) {
          e.x -= (dx / dist) * def.speed * dt;
          e.z -= (dz / dist) * def.speed * dt;
        }
      } else if (CREATURES[e.type] && !(def.nightOnly && !isNight)) {
        if (dist < (def.aggro || 20) && dist > 0.5) {
          e.x += (dx / dist) * def.speed * dt;
          e.z += (dz / dist) * def.speed * dt;
          if (dist < 2.4 && p.invuln <= 0) {
            p.health -= (def.damage || 10) * dt * 1.8;
            p.invuln = 0.5;
          }
        }
      }

      e.y = this.world.getHeightAt(e.x, e.z);
      e.mesh.position.set(e.x, e.y, e.z);
      if ((e.passive || CREATURES[e.type]) && dist > 0.5) {
        e.mesh.rotation.y = Math.atan2(dx, dz);
      }
    }

    this.world.entities = this.world.entities.filter((e) => !e.dead);
  }

  _attack() {
    const p = this.player;
    if (p.attackCd > 0) return;
    p.attackCd = CFG.player.attackCooldown;
    this.isAttacking = true;
    this.attackAnimTimer = 0.35;

    const best = this.world.getAttackTarget(p.x, p.z, CFG.player.attackRange);
    if (!best) return;

    best.hp -= CFG.player.attackDamage;
    if (best.hp <= 0) this._killEntity(best);
  }

  _interact() {
    if (this.interactCooldown > 0) return;
    const p = this.player;

    const near = this.world.getInteractable(p.x, p.z, CFG.player.interactRange);
    if (near) {
      this.interactCooldown = 0.35;
      near.hp -= 18;
      if (near.hp <= 0) {
        this._killEntity(near, true);
        this._toast('采集成功');
      }
      return;
    }

    if ((this.inventory.meat || 0) > 0) {
      this.interactCooldown = 0.5;
      this.inventory.meat--;
      p.hunger = Math.min(100, p.hunger + 28);
      p.health = Math.min(100, p.health + 6);
      this._toast('食用生肉');
    }
  }

  _killEntity(e, harvest = false) {
    e.dead = true;
    this.scene.remove(e.mesh);
    if (RESOURCES[e.type]) {
      this.world.colliders = this.world.colliders.filter(
        (c) => Math.hypot(c.x - e.x, c.z - e.z) > 0.5
      );
    }
    const drop = e.def?.drop || {};
    for (const [k, v] of Object.entries(drop)) {
      this.inventory[k] = (this.inventory[k] || 0) + v;
    }
    const p = this.player;
    if (!harvest) {
      p.score += e.type === 'shadow' ? 35 : e.type === 'wolf' ? 22 : 10;
      if (!harvest) this._toast(`击败了 ${e.type}`);
    } else {
      p.score += 8;
    }
  }

  _updateTime(dt) {
    this.time += dt / CFG.daySeconds;
    if (this.time >= 1) {
      this.time = 0;
      this.day += 1;
      this.player.score += 50;
      this.nightSpawned = false;
      this._toast(`第 ${this.day} 天`);
    }
    if (this.time < 0.18) this.phase = 'dawn';
    else if (this.time < 0.58) this.phase = 'day';
    else if (this.time < 0.78) this.phase = 'dusk';
    else this.phase = 'night';
  }

  _updateLighting() {
    const presets = {
      dawn: { sunY: 22, int: 0.75, bg: 0xf4a460, fog: 0xc9a227 },
      day: { sunY: 55, int: 1.1, bg: 0x87ceeb, fog: 0x9ecae1 },
      dusk: { sunY: 16, int: 0.55, bg: 0xc45c26, fog: 0x8b4513 },
      night: { sunY: 10, int: 0.2, bg: 0x0a1020, fog: 0x12182a },
    };
    const pr = presets[this.phase] || presets.day;
    this.sun.position.y = pr.sunY;
    this.sun.intensity = pr.int;
    this.scene.background.setHex(pr.bg);
    this.scene.fog.color.setHex(pr.fog);
  }

  _render() {
    const p = this.player;
    const dist = 6.5;
    const height = 2.8 + this.pitch * 1.5;

    this._camDesired.set(
      p.x - Math.sin(this.yaw) * dist,
      p.y + height,
      p.z - Math.cos(this.yaw) * dist
    );

    const groundAtCam = this.world.getHeightAt(this._camDesired.x, this._camDesired.z);
    this._camDesired.y = Math.max(this._camDesired.y, groundAtCam + 1.2);

    if (!this._camPos.lengthSq()) this._camPos.copy(this._camDesired);
    this._camPos.lerp(this._camDesired, 0.14);

    this._camTarget.set(p.x, p.y + CFG.player.height * 0.85, p.z);
    this.camera.position.copy(this._camPos);
    this.camera.lookAt(this._camTarget);

    const ppos = this.player;
    this.sun.position.set(ppos.x + 35, this.sun.position.y, ppos.z + 25);
    this.sun.target.position.set(ppos.x, ppos.y, ppos.z);
    this.sun.target.updateMatrixWorld();

    this.renderer.render(this.scene, this.camera);
  }

  _gameOver() {
    this.player.alive = false;
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    document.exitPointerLock();
    this.ui.dead.classList.add('show');
    document.getElementById('dead-day').textContent = String(this.day);
    document.getElementById('dead-score').textContent = String(this.player.score);
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
    const inv = Object.entries(this.inventory)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${k}×${v}`)
      .join(' ');
    if (this.mouseLocked) {
      this.ui.hint.textContent = inv ? `资源: ${inv} · E 采集/食用` : 'WASD 移动 · 左键攻击 · E 采集';
    }
  }

  _toast(msg) {
    const el = this.ui.toast;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 2200);
  }
}
