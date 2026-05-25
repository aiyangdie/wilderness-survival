import * as THREE from 'three';
import { CFG, CREATURES, RESOURCES, ENTITY_LABELS, ITEMS } from './config.js';
import { HumanCharacter } from './human.js';
import { World3D } from './world.js';
import { GameInput } from './input.js';
import { GameUI } from './ui.js';
import { VfxManager } from './effects.js';

const PHASE_LABELS = {
  dawn: '🌅 清晨',
  day: '☀️ 白天',
  dusk: '🌇 黄昏',
  night: '🌙 夜晚',
};

export class Game3D {
  constructor() {
    this.clock = new THREE.Clock();
    this.running = false;
    this.paused = false;
    this.rafId = 0;
    this.interactCooldown = 0;
    this.hudTimer = 0;
    this.isAttacking = false;
    this.attackAnimTimer = 0;
    this.coyoteTimer = 0;
    this.invShow = true;
    this.prevHealth = 100;
    this.wasOnGround = true;
    this.spawnInvuln = 0;
    this.duskWarned = false;
    this.footstepTimer = 0;
    this.camShake = 0;
    this.accumulator = 0;
    this.uiFastTimer = 0;
    this.uiSlowTimer = 0;
    this.focusTarget = null;
    this._lastLitPhase = '';
    this._fpsAccum = 0;
    this._fpsFrames = 0;

    this.yaw = 0;
    this.pitch = 0.25;

    this._camPos = new THREE.Vector3();
    this._camTarget = new THREE.Vector3();
    this._camDesired = new THREE.Vector3();
    this._moveDir = new THREE.Vector3();
    this._forward = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._rawMove = new THREE.Vector3();
    this._shakeOff = new THREE.Vector3();

    this._initRenderer();
    this.ui = new GameUI();
    this.input = new GameInput(this.canvas, () => this.togglePause());
    this.ui.bindPauseControls(this.input, () => this.togglePause(false));
    this.vfx = null;

    this.player = this._newPlayer();
    this.inventory = { wood: 5, fiber: 3 };
    this.day = 1;
    this.time = 0;
    this.phase = 'day';
    this.nightSpawned = false;

    document.getElementById('btn-start').onclick = () => this._begin(true);
    document.getElementById('btn-restart').onclick = () => this._begin(false);
    window.addEventListener('resize', () => this._resize());
    this._resize();
  }

  _initRenderer() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog = new THREE.Fog(0x87ceeb, 50, 140);

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.2, 250);
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    this.renderer.shadowMap.enabled = false;
    document.body.appendChild(this.renderer.domElement);
    this.canvas = this.renderer.domElement;

    this.sun = new THREE.DirectionalLight(0xfff5e6, 1.1);
    this.sun.position.set(40, 55, 30);
    this.sun.castShadow = false;
    this.sun.target = new THREE.Object3D();
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.scene.add(new THREE.AmbientLight(0x8899aa, 0.5));
    this.scene.add(new THREE.HemisphereLight(0x87ceeb, 0x3d5a3c, 0.3));
  }

  _newPlayer() {
    return {
      x: 0, y: 0, z: 0, vy: 0, onGround: true,
      health: 100, hunger: 100, thirst: 100, stamina: 100,
      score: 0, invuln: 0, attackCd: 0, alive: true,
    };
  }

  togglePause(forceState) {
    if (!this.running) return;
    const next = forceState !== undefined ? forceState : !this.paused;
    this.paused = next;
    this.input.setPaused(next);
    this.ui.showPause(next);
    this.ui.setPointerHint(this.input.mouseLocked, next);
    if (!next && !this.input.mouseLocked) this.canvas.requestPointerLock();
  }

  async _begin(fromMenu) {
    const btn = fromMenu
      ? document.getElementById('btn-start')
      : document.getElementById('btn-restart');
    const label = btn?.textContent;
    if (btn) {
      btn.disabled = true;
      btn.textContent = '加载角色中…';
    }
    try {
      await this.start();
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = label || '开始生存';
      }
    }
  }

  async start() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.paused = false;
    this.ui.showPause(false);

    const keepTypes = new Set(['AmbientLight', 'HemisphereLight', 'DirectionalLight']);
    [...this.scene.children].forEach((c) => {
      if (!keepTypes.has(c.type) && c !== this.sun) this.scene.remove(c);
    });

    this.world = new World3D(this.scene);
    this.world.generate();
    this.vfx = new VfxManager(this.scene);
    this.human = new HumanCharacter();
    this.ui.toast('正在加载拟真角色模型…', 'info');
    await this.human.load();
    this.scene.add(this.human.group);

    const spawnY = this.world.getHeightAt(0, 0);
    this.player = this._newPlayer();
    this.player.y = spawnY;
    this.inventory = { wood: 5, fiber: 3 };
    this.day = 1;
    this.time = 0;
    this.phase = 'day';
    this.nightSpawned = false;
    this.duskWarned = false;
    this.yaw = 0;
    this.pitch = 0.25;
    this.interactCooldown = 0;
    this.prevHealth = 100;
    this.spawnInvuln = CFG.spawnInvuln;
    this.wasOnGround = true;
    this._camPos.set(0, 0, 0);
    this.clock.getDelta();

    this.ui.showStart(false);
    this.ui.showDead(false);
    document.querySelectorAll('.hud').forEach((el) => el.classList.remove('hidden'));

    this.running = true;
    this.input.setEnabled(true);
    this.input.setPaused(false);
    setTimeout(() => this.canvas.requestPointerLock(), 100);
    this.ui.toast(
      this.human.useGltf ? '拟真角色已就绪 · 🛡️ 开局保护 4 秒' : '使用备用角色 · C 键烤肉',
      'info'
    );
    this._loop();
  }

  _loop() {
    if (!this.running) return;
    const rawDt = Math.min(this.clock.getDelta(), 0.1);
    this._fpsAccum += rawDt;
    this._fpsFrames += 1;
    if (this._fpsAccum >= 0.5) {
      this.ui.setFps(this._fpsFrames / this._fpsAccum);
      this._fpsAccum = 0;
      this._fpsFrames = 0;
    }

    if (!this.paused) {
      this.accumulator += rawDt;
      const step = CFG.fixedDt;
      const maxSteps = CFG.maxCatchUp;
      let steps = 0;
      while (this.accumulator >= step && steps < maxSteps) {
        this._update(step);
        this.accumulator -= step;
        steps += 1;
      }
      this.vfx?.update(rawDt);
      this.ui.updateFloats(rawDt);
    }

    this._render();
    this.input.endFrame();
    this.rafId = requestAnimationFrame(() => this._loop());
  }

  _update(dt) {
    const p = this.player;
    if (!p.alive) return;

    if (this.input.yawDelta) this.yaw += this.input.yawDelta;
    if (this.input.pitchDelta) {
      this.pitch = Math.max(-0.45, Math.min(0.55, this.pitch + this.input.pitchDelta));
    }

    if (this.input.justPressed('Tab')) {
      this.invShow = !this.invShow;
      document.getElementById('hud-bottom').classList.toggle('hidden', !this.invShow);
    }
    if (this.input.justPressed('KeyC')) this._craft();

    this._updateTime(dt);
    const sprinting = this._updatePlayer(dt);
    this._updateEntities(dt);
    if (this.phase !== this._lastLitPhase) {
      this._updateLighting();
      this._lastLitPhase = this.phase;
    }

    p.hunger = Math.max(0, p.hunger - CFG.decay.hunger * dt);
    p.thirst = Math.max(0, p.thirst - CFG.decay.thirst * dt);
    if (p.hunger <= 0 || p.thirst <= 0) p.health = Math.max(0, p.health - 4 * dt);

    if (p.health < this.prevHealth - 0.5) {
      this.ui.flashDamage();
      this.camShake = 0.15;
    }
    this.prevHealth = p.health;

    if (this.spawnInvuln > 0) this.spawnInvuln -= dt;
    if (p.invuln > 0) p.invuln -= dt;
    if (p.attackCd > 0) p.attackCd -= dt;
    if (this.interactCooldown > 0) this.interactCooldown -= dt;
    if (this.attackAnimTimer > 0) {
      this.attackAnimTimer -= dt;
      if (this.attackAnimTimer <= 0) this.isAttacking = false;
    }
    if (p.onGround) this.coyoteTimer = CFG.player.coyoteTime;
    else this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);
    if (this.camShake > 0) this.camShake = Math.max(0, this.camShake - dt * 2);

    if (this.input.clickAttack) this._attack();
    if (this.input.wantsInteract()) this._interact();

    if (p.health <= 0) this._gameOver();

    this.uiFastTimer += dt;
    this.uiSlowTimer += dt;
    if (this.uiFastTimer >= CFG.ui.barsInterval) {
      this.uiFastTimer = 0;
      this._refreshUIFast(sprinting);
    }
    if (this.uiSlowTimer >= CFG.ui.labelsInterval) {
      this.uiSlowTimer = 0;
      this._refreshUISlow();
    }
  }

  _updatePlayer(dt) {
    const p = this.player;
    const run = this.input.wantsSprint() && p.stamina > 8;
    const speed = run ? CFG.player.runSpeed : CFG.player.walkSpeed;
    if (run) p.stamina = Math.max(0, p.stamina - 18 * dt);
    else p.stamina = Math.min(100, p.stamina + 22 * dt);

    this._forward.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this._right.set(this._forward.z, 0, -this._forward.x);

    const hasMove = this.input.getMoveVector(this._rawMove);
    let moving = false;

    if (hasMove) {
      this._moveDir
        .copy(this._forward).multiplyScalar(-this._rawMove.z)
        .addScaledVector(this._right, this._rawMove.x);
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
    }

    const groundY = this.world.getHeightAt(p.x, p.z);

    if (this.input.justPressed('Space') && (p.onGround || this.coyoteTimer > 0)) {
      p.vy = CFG.player.jumpForce;
      p.onGround = false;
      this.coyoteTimer = 0;
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
      p.y = THREE.MathUtils.lerp(p.y, groundY, Math.min(1, dt * 18));
      if (Math.abs(p.y - groundY) < 0.05) p.y = groundY;
    }

    if (p.onGround && !this.wasOnGround) this.human.triggerLand();
    this.wasOnGround = p.onGround;

    if (moving && p.onGround && run) {
      this.footstepTimer -= dt;
      if (this.footstepTimer <= 0) {
        this.footstepTimer = 0.55;
      }
    }

    this.human.setPosition(p.x, p.y, p.z);
    this.human.update(dt, moving ? speed : 0, p.onGround, this.isAttacking);
    return run && moving;
  }

  _updateEntities(dt) {
    const p = this.player;
    const isNight = this.phase === 'night';
    const protectedSpawn = this.spawnInvuln > 0;

    if (isNight && !this.nightSpawned) {
      this.world.spawnNightMonsters();
      this.nightSpawned = true;
      this.ui.toast('夜晚降临！暗影怪物出现了！', 'danger');
    }

    for (const e of this.world.entities) {
      if (e.dead) continue;
      const dx = p.x - e.x;
      const dz = p.z - e.z;
      const dist = Math.hypot(dx, dz);
      if (dist > CFG.entityCullDist) continue;

      const aiDist = CFG.entityAiDist;
      if (dist > aiDist) continue;

      const def = e.def;
      if (e.passive && dist > 0.5 && dist < 14) {
        e.x -= (dx / dist) * def.speed * dt;
        e.z -= (dz / dist) * def.speed * dt;
      } else if (CREATURES[e.type] && !(def.nightOnly && !isNight)) {
        if (dist < (def.aggro || 20) && dist > 0.5) {
          e.x += (dx / dist) * def.speed * dt;
          e.z += (dz / dist) * def.speed * dt;
          if (dist < 2.5 && p.invuln <= 0 && !protectedSpawn) {
            p.health -= (def.damage || 10) * dt * 1.5;
            p.invuln = 0.55;
          }
        }
      }

      const moved = Math.abs(e.x - e._lastX) > 0.08 || Math.abs(e.z - e._lastZ) > 0.08;
      if (moved || dist < 16) {
        e.y = this.world.getHeightAt(e.x, e.z);
        e._lastX = e.x;
        e._lastZ = e.z;
      }
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

    const target = this.world.getAttackTarget(
      p.x, p.z, CFG.player.attackRange, this.phase === 'night'
    );
    if (!target) {
      this.ui.toast('没有可攻击的目标', 'warn');
      return;
    }

    p.attackCd = CFG.player.attackCooldown;
    this.isAttacking = true;
    this.attackAnimTimer = 0.32;

    const e = target.entity;
    const dmg = CFG.player.attackDamage;
    e.hp -= dmg;

    const col = e.def?.hostile ? 0xff4444 : 0xffcc66;
    this.vfx.burst(e.x, e.y, e.z, col, 5);
    this.vfx.slash(p.x, p.y, p.z, this.human.group.rotation.y);
    this.ui.floatDamage(
      e.x, e.y, e.z, dmg, this.camera, this.renderer.domElement.clientWidth, this.renderer.domElement.clientHeight
    );

    if (e.hp <= 0) {
      this._killEntity(e, false);
      this.ui.toast(`击败了 ${ENTITY_LABELS[e.type] || e.type}`, 'success');
    }
  }

  _interact() {
    if (this.interactCooldown > 0) return;
    const p = this.player;

    const catchT = this.world.getCatchable(
      p.x, p.z, CFG.player.catchRange, CFG.player.catchHpRatio
    );
    if (catchT) {
      const { x, y, z } = catchT.entity;
      this._killEntity(catchT.entity, true);
      this.interactCooldown = 0.5;
      this.vfx.burst(x, y, z, 0xa8dadc, 4);
      this.ui.toast(`捕获了 ${ENTITY_LABELS[catchT.type] || catchT.type}`, 'success');
      p.score += 18;
      return;
    }

    const bush = this.world.getNearestBush(p.x, p.z, 2.8);
    if (bush && p.thirst < 88) {
      this.interactCooldown = 0.6;
      p.thirst = Math.min(100, p.thirst + (bush.def?.drink || 15));
      this.ui.toast('从灌木丛取水饮用', 'success');
      return;
    }

    const target = this.world.getInteractable(p.x, p.z, CFG.player.interactRange);
    if (target) {
      this.interactCooldown = 0.3;
      const e = target.entity;
      e.hp -= CFG.player.interactDamage;
      this.vfx.burst(e.x, e.y, e.z, 0x8fbc8f, 3);
      if (e.hp <= 0) {
        this._killEntity(e, true);
        this.ui.toast(`${target.def?.verb || '采集'}${ENTITY_LABELS[e.type] || e.type} 完成`, 'success');
      }
      return;
    }

    if ((this.inventory.cooked_meat || 0) > 0) {
      this.interactCooldown = 0.55;
      this.inventory.cooked_meat--;
      this.ui.markInventoryDirty();
      p.hunger = Math.min(100, p.hunger + 42);
      p.health = Math.min(100, p.health + 12);
      this.ui.toast('食用熟肉', 'success');
      return;
    }

    if ((this.inventory.meat || 0) > 0) {
      this.interactCooldown = 0.55;
      this.inventory.meat--;
      this.ui.markInventoryDirty();
      p.hunger = Math.min(100, p.hunger + 22);
      p.health = Math.max(0, p.health - 4);
      this.ui.toast('食用生肉（建议按 C 烤肉）', 'warn');
      return;
    }

    this.ui.toast('附近没有可交互目标', 'warn');
  }

  _craft() {
    const need = CFG.craft.cooked_meat;
    const inv = this.inventory;
    if ((inv.meat || 0) < need.meat || (inv.wood || 0) < need.wood) {
      this.ui.toast('烤肉需要：生肉×1 + 木材×1', 'warn');
      return;
    }
    inv.meat -= need.meat;
    inv.wood -= need.wood;
    inv.cooked_meat = (inv.cooked_meat || 0) + 1;
    this.ui.markInventoryDirty();
    this.ui.toast('🍖 烤肉完成（按 E 食用）', 'success');
    this.player.score += 5;
  }

  _killEntity(e, harvest) {
    e.dead = true;
    this.scene.remove(e.mesh);
    if (RESOURCES[e.type]) {
      this.world.colliders = this.world.colliders.filter(
        (c) => Math.abs(c.x - e.x) > 0.1 || Math.abs(c.z - e.z) > 0.1
      );
    }
    const drops = e.def?.drop || {};
    for (const [k, v] of Object.entries(drops)) {
      this.inventory[k] = (this.inventory[k] || 0) + v;
      this.ui.markInventoryDirty();
      if (harvest) {
        this.ui.floatPickup(
          k, v, e.x, e.y, e.z, this.camera,
          this.renderer.domElement.clientWidth,
          this.renderer.domElement.clientHeight
        );
      }
    }
    if (!harvest) {
      this.player.score += e.type === 'shadow' ? 35 : e.type === 'wolf' ? 22 : 10;
    } else {
      this.player.score += 8;
    }
  }

  _refreshUIFast(sprinting) {
    const p = this.player;
    this.ui.updateBars(p, sprinting);
    this.ui.updateMeta(this.day, PHASE_LABELS[this.phase] || '', this.time, p.score, this.phase);
    this.ui.updateSpawnShield(this.spawnInvuln);
    this.ui.setPointerHint(this.input.mouseLocked, this.paused);

    this.focusTarget = this.world.getFocusTarget(
      p.x, p.z, CFG.player.interactRange, CFG.player.attackRange, this.phase === 'night'
    );
    const focus = this.focusTarget;
    const prompt = this.ui.getTargetPrompt(focus, this.inventory);
    if (prompt && this.input.mouseLocked) {
      this.ui.setInteractPrompt(prompt.text, prompt.mode, prompt.hpRatio);
      this.ui.setCrosshairMode(prompt.mode === 'danger' ? 'danger' : prompt.mode, this.isAttacking);
    } else {
      this.ui.clearInteractPrompt();
      this.ui.setCrosshairMode('neutral', this.isAttacking);
    }

    if (focus?.entity && !focus.entity.dead) {
      const fe = focus.entity;
      this.vfx.setFocus(fe.x, fe.y, fe.z, prompt?.mode || 'neutral', true);
    } else {
      this.vfx.setFocus(0, 0, 0, 'neutral', false);
    }
  }

  _refreshUISlow() {
    const p = this.player;
    this.ui.updateInventory(this.inventory);
    this.ui.updateCompass(this.yaw);
    const w = this.renderer.domElement.clientWidth;
    const h = this.renderer.domElement.clientHeight;
    this.ui.updateWorldLabels(
      this.world.entities,
      this.focusTarget,
      this.camera,
      w,
      h,
      p.x,
      p.z
    );
  }

  _refreshUI(sprinting) {
    this._refreshUIFast(sprinting);
    this._refreshUISlow();
  }

  _updateTime(dt) {
    const prev = this.phase;
    this.time += dt / CFG.daySeconds;
    if (this.time >= 1) {
      this.time = 0;
      this.day += 1;
      this.player.score += 50;
      this.nightSpawned = false;
      this.duskWarned = false;
      this.ui.toast(`第 ${this.day} 天`, 'success');
    }
    if (this.time < 0.18) this.phase = 'dawn';
    else if (this.time < 0.58) this.phase = 'day';
    else if (this.time < 0.78) this.phase = 'dusk';
    else this.phase = 'night';

    if (this.phase === 'dusk' && prev !== 'dusk' && !this.duskWarned) {
      this.duskWarned = true;
      this.ui.toast('黄昏将至，快准备抵御黑夜！', 'warn');
    }
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
    const cam = CFG.camera;
    const dist = cam.dist;
    const height = cam.height + this.pitch * 1.5;

    this._camDesired.set(
      p.x - Math.sin(this.yaw) * dist,
      p.y + height,
      p.z - Math.cos(this.yaw) * dist
    );

    if (this.world) {
      const gy = this.world.getHeightAt(this._camDesired.x, this._camDesired.z);
      this._camDesired.y = Math.max(this._camDesired.y, gy + 1.2);
    }

    const smooth = this.paused ? 0.08 : cam.smooth;
    if (this._camPos.lengthSq() < 0.01) this._camPos.copy(this._camDesired);
    this._camPos.lerp(this._camDesired, smooth);

    if (this.camShake > 0) {
      this._shakeOff.set(
        (Math.random() - 0.5) * this.camShake,
        (Math.random() - 0.5) * this.camShake * 0.5,
        (Math.random() - 0.5) * this.camShake
      );
      this._camPos.add(this._shakeOff);
    }

    const eyeH = this.human?.getEyeHeight?.() ?? CFG.player.height * 0.85;
    this._camTarget.set(p.x, p.y + eyeH, p.z);
    this.camera.position.copy(this._camPos);
    this.camera.lookAt(this._camTarget);

    this.sun.position.set(p.x + 35, this.sun.position.y, p.z + 25);
    this.sun.target.position.set(p.x, p.y, p.z);
    this.sun.target.updateMatrixWorld();

    this.renderer.render(this.scene, this.camera);
  }

  _gameOver() {
    this.player.alive = false;
    this.running = false;
    this.input.setEnabled(false);
    cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    document.exitPointerLock();
    document.querySelectorAll('.hud').forEach((el) => el.classList.add('hidden'));
    this.ui.showDead(true, this.day, this.player.score);
  }

  _resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }
}
