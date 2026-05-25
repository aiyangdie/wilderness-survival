import * as THREE from 'three';
import { CFG, CREATURES, RESOURCES, ENTITY_LABELS, ITEMS, RECIPES } from './config.js';
import { HumanCharacter } from './human.js';
import { World3D } from './world.js';
import { GameInput } from './input.js';
import { GameUI } from './ui.js';
import { VfxManager } from './effects.js';
import { AtmosphereFX, attachGroundShadow } from './atmosphere.js';
import {
  applyDrink,
  applyEat,
  applyShelterRest,
  getStatusHint,
  refundRecipe,
} from './survival.js';
import { CraftSystem } from './craft.js';
import { BuildSystem } from './buildings.js';
import { EquipmentManager } from './equipment.js';

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
    this._attackPulse = false;
    this._interactPulse = false;
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
    this._lastFocusKey = '';
    this.craftOpen = false;
    this._edgeToastCd = 0;
    this._unlockHintShown = false;
    this.craft = new CraftSystem();
    this.equipment = null;
    this.buildSys = null;

    this.yaw = 0;
    this.pitch = 0.25;

    this._camPos = new THREE.Vector3();
    this._camTarget = new THREE.Vector3();
    this._camDesired = new THREE.Vector3();
    this._moveDir = new THREE.Vector3();
    this._forward = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._rawMove = new THREE.Vector3();
    this._preyDistCache = Infinity;
    this._preyDistTimer = 0;
    this._nearColliders = null;
    this._shakeOff = new THREE.Vector3();
    this._frame = 0;
    this._lastGroundX = 0;
    this._lastGroundZ = 0;
    this._camGroundY = 0;
    this._camGroundFrame = 0;
    this._shelterCache = { x: 0, z: 0, val: 0 };
    this._deadPending = 0;
    this._guideOpen = false;
    this._statusHintCd = 0;

    this._initRenderer();
    this.ui = new GameUI();
    this.ui.onCraftRecipe = (id) => this.onCraftRecipe(id);
    this.input = new GameInput(this.canvas, () => this.togglePause(), () => this._onEscapeKey());
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
    document.getElementById('btn-craft-close')?.addEventListener('click', () => {
      if (this.craftOpen) this._toggleCraft();
    });
    document.getElementById('btn-guide-close')?.addEventListener('click', () => this._toggleGuide(false));
    document.getElementById('btn-guide')?.addEventListener('click', () => this._toggleGuide());
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyH' && this.running && !this.paused) this._toggleGuide();
    });
    window.addEventListener('resize', () => this._resize());
    this._resize();
    this._canvasW = window.innerWidth;
    this._canvasH = window.innerHeight;
  }

  _initRenderer() {
    this.scene = new THREE.Scene();
    const dayFog = CFG.lighting.day;
    this.scene.background = new THREE.Color(dayFog.bg);
    this.scene.fog = new THREE.Fog(dayFog.fog, dayFog.fogNear, dayFog.fogFar);

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.2, 280);
    this.renderer = new THREE.WebGLRenderer({
      antialias: CFG.render.antialias !== false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, CFG.render.dpr ?? 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = CFG.render.exposure ?? 1.12;
    this.renderer.shadowMap.enabled = false;
    document.body.appendChild(this.renderer.domElement);
    this.canvas = this.renderer.domElement;

    this.sun = new THREE.DirectionalLight(0xfff8ee, 1.4);
    this.sun.position.set(40, 60, 30);
    this.sun.castShadow = false;
    this.sun.target = new THREE.Object3D();
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.ambient = new THREE.AmbientLight(0xeaf2ff, 0.88);
    this.scene.add(this.ambient);

    this.hemi = new THREE.HemisphereLight(0xc8e4ff, 0x7ab86a, 0.58);
    this.scene.add(this.hemi);

    this.rim = new THREE.DirectionalLight(0xa8c8ff, 0.38);
    this.rim.position.set(-35, 28, -42);
    this.scene.add(this.rim);
  }

  _newPlayer() {
    return {
      x: 0, y: 0, z: 0, vy: 0, onGround: true,
      health: 100, hunger: 100, thirst: 100, stamina: 100,
      score: 0, invuln: 0, attackCd: 0, alive: true,
    };
  }

  _onEscapeKey() {
    if (this.buildSys?.mode) {
      this._cancelBuild();
      return true;
    }
    if (this.craftOpen) {
      this._toggleCraft();
      return true;
    }
    if (this._guideOpen) {
      this._toggleGuide(false);
      return true;
    }
    return false;
  }

  _craftCtx() {
    const p = this.player;
    return { nearCampfire: !!this.buildSys?.getNearCampfire(p.x, p.z) };
  }

  togglePause(forceState) {
    if (!this.running) return;
    const next = forceState !== undefined ? forceState : !this.paused;
    if (next && this.craftOpen) {
      this.craftOpen = false;
      this.ui.showCraft(false);
    }
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
    } catch (err) {
      console.error(err);
      this.ui.toast('启动失败，请刷新页面重试', 'warn');
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
    const keepNodes = new Set([this.sun, this.sun.target, this.human?.group].filter(Boolean));
    [...this.scene.children].forEach((c) => {
      if (!keepTypes.has(c.type) && !keepNodes.has(c)) this.scene.remove(c);
    });

    if (!this.human) {
      this.human = new HumanCharacter();
      await this.human.load();
      this.scene.add(this.human.group);
      this.equipment = new EquipmentManager(this.human);
    } else if (!this.human.group.parent) {
      this.scene.add(this.human.group);
    }
    if (!this.equipment) this.equipment = new EquipmentManager(this.human);

    this.world = new World3D(this.scene);
    this.world.generate();
    this.vfx = new VfxManager(this.scene);
    if (this.atmosphere) this.atmosphere.dispose();
    this.atmosphere = new AtmosphereFX(this.scene);
    this.buildSys = new BuildSystem(this.scene, this.world);
    if (!this._playerShadow) {
      this._playerShadow = attachGroundShadow(this.human.group, 0.75, 0.35);
    }

    const spawnY = this.world.getFootY(0, 0);
    this.player = this._newPlayer();
    this.player.y = spawnY;
    this.player.groundY = spawnY;
    this._lastGroundX = 0;
    this._lastGroundZ = 0;
    this._camGroundY = spawnY;
    this._camGroundFrame = 0;
    this.inventory = { wood: 5, fiber: 3 };
    this.day = 1;
    this.time = 0.32;
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
    this._lastLitPhase = '';
    this.clock.getDelta();
    this._updateLighting();
    this._lastLitPhase = this.phase;

    this.ui.showStart(false);
    this.ui.showDead(false);
    document.querySelectorAll('.hud').forEach((el) => el.classList.remove('hidden'));

    this.running = true;
    this.input.setEnabled(true);
    this.input.setPaused(false);
    setTimeout(() => this.canvas.requestPointerLock(), 100);
    this.ui.toast('按 H 打开生存指南 · B 制作建造 · 灌木 E 喝水', 'info');
    setTimeout(() => {
      this.ui.toast('狩猎→篝火烤肉→建棚屋休息 · 夜晚用木墙挡怪', 'info');
    }, 3200);
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
      const logicDt = Math.min(rawDt, CFG.render.maxDt);
      try {
        this._update(logicDt, rawDt);
        this.vfx?.update(logicDt);
        this.ui.updateFloats(logicDt);
      } catch (err) {
        console.error('[Game3D] update error', err);
      }
      this._render();
    } else if ((this._pauseRenderCd = (this._pauseRenderCd ?? 0) + 1) % 4 === 0) {
      this._render();
    }
    this.input.endFrame();
    this.rafId = requestAnimationFrame(() => this._loop());
  }

  _getShelterHeal(px, pz) {
    const c = this._shelterCache;
    if (Math.abs(px - c.x) < 2 && Math.abs(pz - c.z) < 2) return c.val;
    c.x = px;
    c.z = pz;
    c.val = this.buildSys?.getShelterHeal(px, pz) || 0;
    return c.val;
  }

  _update(dt, animDt = dt) {
    const p = this.player;
    if (!p.alive) return;

    this._animDt = animDt;
    this._frame += 1;
    const menuOpen = this.craftOpen;

    if (this.input.justPressed('KeyB')) this._toggleCraft();

    if (!menuOpen) {
      if (this.input.yawDelta) this.yaw += this.input.yawDelta;
      if (this.input.pitchDelta) {
        this.pitch = Math.max(-0.45, Math.min(0.55, this.pitch + this.input.pitchDelta));
      }
      if (this.input.justPressed('Tab')) {
        this.invShow = !this.invShow;
        document.getElementById('hud-bottom').classList.toggle('hidden', !this.invShow);
      }
      if (this.buildSys?.mode) {
        if (this.input.justPressed('KeyR')) this.buildSys.rotate();
        if (this.input.clickAttack) this._tryPlaceBuild();
      } else {
        if (this.input.justPressed('KeyC')) this._craftQuick('cooked_meat');
        if (this.input.clickAttack) this._attack();
        if (this.input.wantsInteract()) this._interact();
      }
    }

    if (this.buildSys?.mode) {
      this.buildSys.update(p.x, p.y, p.z, this.yaw, (x, z) => this.world.getFootY(x, z));
    }

    this._updateTime(dt);
    const sprinting = menuOpen ? false : this._updatePlayer(dt);
    this._updateEntities(dt);
    this.world.flushPropBatches();
    if (this.phase !== this._lastLitPhase) {
      this._updateLighting();
      this._lastLitPhase = this.phase;
    }
    this.atmosphere?.setPhase(this.phase === 'night');
    this.atmosphere?.update(dt, p.x, p.z);

    const nearShelter = this.buildSys?.getNearShelter(p.x, p.z);
    const nearCampfire = this.buildSys?.getNearCampfire(p.x, p.z);
    const holdingRest =
      nearShelter &&
      (this.input.isDown('KeyE') || this.input.isDown('KeyF')) &&
      !this.world.getInteractable(p.x, p.z, 2.5);
    if (holdingRest) applyShelterRest(p, dt);

    const shelterHeal = this._getShelterHeal(p.x, p.z);
    if (shelterHeal > 0 && !holdingRest) {
      p.health = Math.min(100, p.health + shelterHeal * dt);
    }
    if (nearCampfire) {
      p.health = Math.min(100, p.health + (CFG.survival?.campfire?.warmthHealth ?? 0.5) * dt);
    }

    const sprintingMove = this.input.wantsSprint() && p.stamina > 8;
    const hungerMul = sprintingMove ? (CFG.survival?.sprintHungerMul ?? 1.2) : 1;
    const thirstMul = sprintingMove ? (CFG.survival?.sprintThirstMul ?? 1.15) : 1;
    p.hunger = Math.max(0, p.hunger - CFG.decay.hunger * hungerMul * dt);
    p.thirst = Math.max(0, p.thirst - CFG.decay.thirst * thirstMul * dt);
    const starve = CFG.decay.healthFromStarve ?? 3.5;
    if (p.hunger <= 0 || p.thirst <= 0) p.health = Math.max(0, p.health - starve * dt);
    p.hunger = Math.max(0, Math.min(100, p.hunger));
    p.thirst = Math.max(0, Math.min(100, p.thirst));
    p.health = Math.max(0, Math.min(100, p.health));
    p.stamina = Math.max(0, Math.min(100, p.stamina));

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
      if (this.attackAnimTimer <= 0) {
        this.isAttacking = false;
        this._attackPulse = false;
      }
    }
    if (p.onGround) this.coyoteTimer = CFG.player.coyoteTime;
    else this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);
    if (this.camShake > 0) this.camShake = Math.max(0, this.camShake - dt * 2);

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

  _nearestPassiveDist() {
    const p = this.player;
    let bestSq = Infinity;
    for (const e of this.world.entities) {
      if (e.dead || !e.passive) continue;
      const dx = e.x - p.x;
      const dz = e.z - p.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < bestSq) bestSq = dSq;
    }
    return bestSq === Infinity ? Infinity : Math.sqrt(bestSq);
  }

  _movePassiveFlee(e, dx, dz, dist, def, dt, sprinting) {
    const P = CFG.passive;
    if (dist >= P.calmDist) {
      e._fleeStamina = Math.min(100, (e._fleeStamina ?? 85) + dt * P.staminaRegen);
      return false;
    }
    if (dist < 0.55 || dist > P.fleeDist) return false;

    const drain = sprinting ? P.staminaDrain * 1.3 : P.staminaDrain;
    e._fleeStamina = Math.max(0, (e._fleeStamina ?? 85) - dt * drain);
    const tired = e._fleeStamina <= 10;
    const cornered = this.world.isNearBounds(e.x, e.z, 5);

    let mul = P.fleeSpeedMul;
    if (tired) mul = P.tiredSpeedMul;
    else if (cornered) mul = P.corneredSpeedMul;

    const spd = def.speed * mul;
    const nx = e.x - (dx / dist) * spd * dt;
    const nz = e.z - (dz / dist) * spd * dt;
    const c = this.world.clampInBounds(nx, nz, e.radius || 1);
    e.x = c.x;
    e.z = c.z;
    if (c.hitEdge) e._fleeStamina = Math.max(0, e._fleeStamina - dt * 45);
    return true;
  }

  _updatePlayer(dt) {
    const p = this.player;
    const run = this.input.wantsSprint() && p.stamina > 8;
    let speed = run ? CFG.player.runSpeed : CFG.player.walkSpeed;

    this._preyDistTimer -= dt;
    if (this._preyDistTimer <= 0) {
      this._preyDistCache = this._nearestPassiveDist();
      this._preyDistTimer = 0.3;
    }
    if (run && this._preyDistCache < 14 && this._preyDistCache > 0.8) {
      speed *= CFG.player.sprintBonusNearPrey ?? 1.12;
    }
    if (run) p.stamina = Math.max(0, p.stamina - 14 * dt);
    else p.stamina = Math.min(100, p.stamina + 28 * dt);

    this._forward.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this._right.set(this._forward.z, 0, -this._forward.x);

    const hasMove = this.input.getMoveVector(this._rawMove);
    let moving = false;

    this._nearColliders = this.world.getNearbyColliders(p.x, p.z, 11);

    if (hasMove) {
      this._moveDir
        .copy(this._forward).multiplyScalar(-this._rawMove.z)
        .addScaledVector(this._right, this._rawMove.x);
      if (this._moveDir.lengthSq() > 0.0001) {
        this._moveDir.normalize();
        const nx = p.x + this._moveDir.x * speed * dt;
        const nz = p.z + this._moveDir.z * speed * dt;
        const resolved = this.world.resolveCircleMove(
          p.x, p.z, nx, nz, 0.55, this._nearColliders
        );
        p.x = resolved.x;
        p.z = resolved.z;
        if (resolved.hitEdge) {
          if (this._edgeToastCd <= 0) {
            this._edgeToastCd = 2.5;
            this.ui.toast('已到达荒野边界', 'info');
          }
        }
        if (this._edgeToastCd > 0) this._edgeToastCd -= dt;
        this.human.setRotationY(Math.atan2(this._moveDir.x, this._moveDir.z));
        moving = true;
      }
    }

    const targetGround = this.world.getFootY(p.x, p.z, 0.48);

    if (this.input.justPressed('Space') && (p.onGround || this.coyoteTimer > 0)) {
      p.vy = CFG.player.jumpForce;
      p.onGround = false;
      this.coyoteTimer = 0;
    }

    if (!p.onGround) {
      p.vy -= CFG.player.gravity * dt;
      p.y += p.vy * dt;
      if (p.y <= targetGround) {
        p.y = targetGround;
        p.vy = 0;
        p.onGround = true;
      }
    } else {
      const snap = CFG.player.groundSnapSpeed ?? 24;
      const err = targetGround - p.y;
      if (err > 0.12 || err < -0.25) p.y = targetGround;
      else p.y += err * Math.min(1, dt * snap);
      p.groundY = targetGround;
      p.vy = 0;
      p.onGround = true;
      this._lastGroundX = p.x;
      this._lastGroundZ = p.z;
    }

    if (p.onGround && !this.wasOnGround) {
      this.human.triggerLand();
      this.vfx?.dust(p.x, p.y, p.z);
    }
    this.wasOnGround = p.onGround;

    if (moving && p.onGround && run) {
      this.footstepTimer -= dt;
      if (this.footstepTimer <= 0) {
        this.footstepTimer = 0.55;
      }
    }

    this.human.setPosition(p.x, p.y, p.z);
    this.human.update(
      this._animDt ?? dt,
      {
        speed: moving ? speed : 0,
        onGround: p.onGround,
        vy: p.vy,
        sprinting: run && moving,
        attackPulse: this._attackPulse,
        interactPulse: this._interactPulse,
        weaponId: this.equipment?.slots?.weapon || null,
      },
      this.equipment
    );
    if (this._attackPulse) this._attackPulse = false;
    if (this._interactPulse) this._interactPulse = false;
    return run && moving;
  }

  _updateEntities(dt) {
    const p = this.player;
    const isNight = this.phase === 'night';
    const protectedSpawn = this.spawnInvuln > 0;
    const px = p.x;
    const pz = p.z;

    const sprinting = this.input.wantsSprint() && p.stamina > 8;
    const aiDistSq = CFG.entityAiDist * CFG.entityAiDist;
    const cullDistSq = CFG.entityCullDist * CFG.entityCullDist;
    const visibleDistSq = CFG.entityVisibleDist * CFG.entityVisibleDist;
    const animDistSq = CFG.entityAnimDist * CFG.entityAnimDist;
    const nearAnimSq = 144;
    const faceDistSq = 64;
    const aiFrame = this._frame & 1;

    if (isNight && !this.nightSpawned) {
      this.world.spawnNightMonsters();
      this.nightSpawned = true;
      this.ui.toast('夜晚降临！暗影怪物出现了！', 'danger');
    }

    const ents = this.world.entities;
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (e.dead) continue;
      const dx = px - e.x;
      const dz = pz - e.z;
      const distSq = dx * dx + dz * dz;
      let moved = false;

      if (distSq <= aiDistSq) {
        const dist = Math.sqrt(distSq);
        const def = e.def;
        const prevX = e.x;
        const prevZ = e.z;
        const runAi = distSq < 400 || aiFrame === 0;

        if (runAi) {
          if (e.passive && dist > 0.5 && dist < CFG.passive.fleeDist + 2) {
            moved = this._movePassiveFlee(e, dx, dz, dist, def, dt, sprinting);
          } else if (CREATURES[e.type] && !(def.nightOnly && !isNight)) {
            if (dist < (def.aggro || 20) && dist > 0.5) {
              const nx = e.x + (dx / dist) * def.speed * dt;
              const nz = e.z + (dz / dist) * def.speed * dt;
              const nearCol = this.world.getNearbyColliders(e.x, e.z, 12);
              const resolved = this.world.resolveCircleMove(
                e.x,
                e.z,
                nx,
                nz,
                e.radius || 1,
                nearCol
              );
              e.x = resolved.x;
              e.z = resolved.z;
              moved = true;
              if (dist < 2.5 && p.invuln <= 0 && !protectedSpawn) {
                const reduce = this._getCombatStats().damageReduce;
                p.health -= (def.damage || 10) * dt * 1.5 * (1 - reduce);
                p.invuln = 0.55;
              }
            }
          }
        }

        moved = moved || Math.abs(e.x - prevX) > 0.02 || Math.abs(e.z - prevZ) > 0.02;
      }

      if (distSq > cullDistSq) continue;

      if (moved || distSq < 196) {
        e.y = this.world.getFootY(e.x, e.z, (e.radius || 0.5) * 0.5);
        e._lastX = e.x;
        e._lastZ = e.z;
        e._heightCd = 0;
      } else if ((e._heightCd ?? 0) <= 0 && distSq < 784) {
        e.y = this.world.getFootY(e.x, e.z, (e.radius || 0.5) * 0.5);
        e._heightCd = 0.35;
      } else if (e._heightCd > 0) {
        e._heightCd -= dt;
      }

      if (!e.visual) continue;

      const visible = distSq < visibleDistSq;
      e.visual.setVisible(visible);
      if (!visible) continue;

      e.visual.group.position.set(e.x, e.y, e.z);

      if (moved) {
        const mx = e.x - (e._faceX ?? e.x);
        const mz = e.z - (e._faceZ ?? e.z);
        if (mx * mx + mz * mz > 0.00001) {
          e.visual.group.rotation.y = Math.atan2(mx, mz);
        }
      } else if (CREATURES[e.type] && distSq > 0.25 && distSq < faceDistSq) {
        e.visual.group.rotation.y = Math.atan2(dx, dz);
      }

      if (moved || distSq < animDistSq) {
        if (moved || distSq < nearAnimSq || aiFrame === 0) {
          let mood = 'idle';
          if (e.passive && distSq < 121) mood = 'flee';
          else if (e.def?.hostile && distSq < (e.def.aggro || 20) ** 2) mood = 'hunt';
          if ((e._hurtTimer ?? 0) > 0) e._hurtTimer -= dt;
          const mx = e.x - (e._faceX ?? e.x);
          const mz = e.z - (e._faceZ ?? e.z);
          const faceYaw =
            moved && mx * mx + mz * mz > 0.0001
              ? Math.atan2(mx, mz)
              : Math.atan2(dx, dz);
          e.visual.update(dt, moved, e.def?.speed || 5, {
            mood: (e._hurtTimer ?? 0) > 0 ? 'hurt' : mood,
            hpRatio: e.hp / e.maxHp,
            faceYaw,
          });
        }
      }

      e._faceX = e.x;
      e._faceZ = e.z;
    }

    if (this._deadPending > 0) {
      let write = 0;
      for (let read = 0; read < ents.length; read++) {
        if (!ents[read].dead) {
          if (write !== read) ents[write] = ents[read];
          write++;
        }
      }
      ents.length = write;
      this._deadPending = 0;
    }
  }

  _getCombatStats() {
    return this.equipment?.getStats() || { attackBonus: 0, rangeBonus: 0, interactBonus: 0, damageReduce: 0 };
  }

  _attack() {
    const p = this.player;
    if (p.attackCd > 0) return;
    const stats = this._getCombatStats();
    const range = CFG.player.attackRange + stats.rangeBonus;

    const target = this.world.getAttackTarget(
      p.x, p.z, range, this.phase === 'night'
    );
    if (!target) {
      this.ui.toast('没有可攻击的目标', 'warn');
      return;
    }

    p.attackCd = CFG.player.attackCooldown;
    this.isAttacking = true;
    this._attackPulse = true;
    this.attackAnimTimer = 0.48;
    this.human._attackStarted = false;

    const e = target.entity;
    const dmg = CFG.player.attackDamage + stats.attackBonus;
    e.hp -= dmg;
    e._hurtTimer = 0.32;
    e.visual?.triggerHurt?.();

    const col = e.def?.hostile ? 0xff4444 : 0xffcc66;
    this.vfx.burst(e.x, e.y, e.z, col, 5);
    this.vfx.slash(p.x, p.y, p.z, this.human.group.rotation.y);
    this.ui.floatDamage(
      e.x, e.y, e.z, dmg, this.camera, this._canvasW, this._canvasH
    );

    if (e.hp <= 0) {
      this._killEntity(e, false);
      this.ui.toast(`击败了 ${ENTITY_LABELS[e.type] || e.type}`, 'success');
    }
  }

  _cancelBuild() {
    if (!this.buildSys?.mode) return;
    const { refund, recipeId } = this.buildSys.exit(true);
    if (refund && recipeId) {
      refundRecipe(recipeId, this.inventory);
      this.ui.markInventoryDirty();
      this.ui.toast('已取消建造，材料已退还', 'info');
    } else {
      this.ui.toast('已取消建造', 'info');
    }
  }

  _toggleGuide(force) {
    this._guideOpen = force !== undefined ? force : !this._guideOpen;
    this.ui.showGuide(this._guideOpen);
    if (this._guideOpen) document.exitPointerLock();
    else if (this.running && !this.paused && !this.craftOpen) this.canvas.requestPointerLock();
  }

  _interact() {
    if (this.interactCooldown > 0) return;
    const p = this.player;
    const stats = this._getCombatStats();
    const nearShelter = this.buildSys?.getNearShelter(p.x, p.z);
    const nearCampfire = this.buildSys?.getNearCampfire(p.x, p.z);

    const catchT = this.world.getCatchable(
      p.x, p.z, CFG.player.catchRange, CFG.player.catchHpRatio
    );
    if (catchT) {
      const { x, y, z } = catchT.entity;
      this._interactPulse = true;
      this._killEntity(catchT.entity, true);
      this.interactCooldown = 0.5;
      this.vfx.burst(x, y, z, 0xa8dadc, 4);
      this.ui.toast(`捕获了 ${ENTITY_LABELS[catchT.type] || catchT.type}`, 'success');
      p.score += 18;
      return;
    }

    const bush = this.world.getNearestBush(p.x, p.z, 2.8);
    if (bush && p.thirst < 95) {
      this.interactCooldown = 0.6;
      this._interactPulse = true;
      applyDrink(p, bush.def?.drink || 22);
      this.ui.toast('从灌木丛取水 — 口渴恢复', 'success');
      return;
    }

    const target = this.world.getInteractable(p.x, p.z, CFG.player.interactRange);
    if (target) {
      this.interactCooldown = 0.3;
      this._interactPulse = true;
      const e = target.entity;
      e.hp -= CFG.player.interactDamage + stats.interactBonus;
      e._hurtTimer = 0.22;
      e.visual?.triggerHurt?.();
      this.vfx.burst(e.x, e.y, e.z, 0x8fbc8f, 3);
      if (e.hp <= 0) {
        this._killEntity(e, true);
        this.ui.toast(`${target.def?.verb || '采集'}${ENTITY_LABELS[e.type] || e.type} 完成`, 'success');
      }
      return;
    }

    if ((this.inventory.cooked_meat || 0) > 0) {
      this.interactCooldown = 0.55;
      this._interactPulse = true;
      this.inventory.cooked_meat--;
      this.ui.markInventoryDirty();
      const eat = applyEat('cooked_meat', p);
      this.ui.toast(eat.msg, 'success');
      return;
    }

    if ((this.inventory.meat || 0) > 0) {
      this.interactCooldown = 0.55;
      this._interactPulse = true;
      this.inventory.meat--;
      this.ui.markInventoryDirty();
      const eat = applyEat('meat', p);
      this.ui.toast(eat.msg, nearCampfire ? 'info' : 'warn');
      return;
    }

    if ((this.inventory.fiber || 0) > 0 && p.hunger < 70) {
      this.interactCooldown = 0.4;
      this._interactPulse = true;
      this.inventory.fiber--;
      this.ui.markInventoryDirty();
      const eat = applyEat('fiber', p);
      this.ui.toast(eat.msg, 'info');
      return;
    }

    if (nearShelter && !this.world.getInteractable(p.x, p.z, 2.5)) {
      this.ui.toast('棚屋旁：按住 E 休息恢复', 'info');
      return;
    }
    if (nearCampfire) this.ui.toast('篝火旁：有生肉按 C 烤肉', 'info');
    else this.ui.toast('附近没有可交互目标 — 按 H 查看生存指南', 'warn');
  }

  _craftQuick(recipeId) {
    const res = this.craft.craft(recipeId, this.inventory, this.equipment, this._craftCtx());
    if (!res.ok) {
      this.ui.toast(res.reason || '材料不足', 'warn');
      return;
    }
    this.ui.markInventoryDirty();
    this.ui.updateEquipment(this.equipment?.slots);
    const ctx = this._craftCtx();
    const msg =
      recipeId === 'cooked_meat'
        ? ctx.nearCampfire
          ? '篝火烤肉完成'
          : '野外烤肉完成（消耗木材）'
        : `${RECIPES[recipeId]?.name || recipeId} 完成`;
    this.ui.toast(msg, 'success');
    this.player.score += recipeId === 'cooked_meat' ? 6 : 5;
  }

  _toggleCraft() {
    this.craftOpen = !this.craftOpen;
    const ctx = this._craftCtx();
    if (this.craftOpen) {
      document.exitPointerLock();
      this.ui.showCraft(true, this.inventory, this.craft, ctx);
    } else {
      this.ui.showCraft(false);
      if (this.running && !this.paused) this.canvas.requestPointerLock();
    }
  }

  onCraftRecipe(recipeId) {
    const ctx = this._craftCtx();
    const res = this.craft.craft(recipeId, this.inventory, this.equipment, ctx);
    if (!res.ok) {
      this.ui.toast(res.reason || '材料不足', 'warn');
      return;
    }
    this.ui.markInventoryDirty();
    this.ui.updateEquipment(this.equipment?.slots);
    this.ui.renderCraftList(this.inventory, this.craft, ctx);

    if (res.build) {
      this.craftOpen = false;
      this.ui.showCraft(false);
      this.buildSys.enter(res.build, recipeId);
      this.ui.toast(`放置：${RECIPES[recipeId].name} · 左键确认 R旋转 Esc取消退还材料`, 'info');
      return;
    }
    if (recipeId === 'cooked_meat') {
      this.ui.toast(
        ctx.nearCampfire ? '篝火烤肉完成' : '野外烤肉完成（消耗木材）',
        'success'
      );
    } else {
      this.ui.toast(`${res.recipe.name} 制作完成`, 'success');
    }
    this.player.score += 8;
  }

  _tryPlaceBuild() {
    if (!this.buildSys?.mode) return;
    const buildType = this.buildSys.mode;
    if (this.buildSys.tryPlace(this.inventory)) {
      const t = buildType;
      this.ui.markInventoryDirty();
      const tips = {
        campfire: '篝火：靠近按 C 烤肉（只需生肉）',
        shelter: '棚屋：站在旁边按住 E 休息回血',
        wall: '木墙：可阻挡夜间怪物',
        floor: '木地板：平整落脚区',
      };
      this.ui.toast(`建造完成 — ${tips[t] || ''}`, 'success');
      this.player.score += 15;
    } else {
      this.ui.toast('无法放置：与其他物体重叠', 'warn');
    }
  }

  _killEntity(e, harvest) {
    e.dead = true;
    this._deadPending += 1;
    this.world.hideEntityVisual(e);
    if (RESOURCES[e.type]) {
      const cols = this.world.colliders;
      for (let i = cols.length - 1; i >= 0; i--) {
        const c = cols[i];
        if (Math.abs(c.x - e.x) <= 0.1 && Math.abs(c.z - e.z) <= 0.1) {
          cols[i] = cols[cols.length - 1];
          cols.pop();
          break;
        }
      }
      this.world.invalidateColliderCache();
    }
    const drops = e.def?.drop || {};
    for (const [k, v] of Object.entries(drops)) {
      this.inventory[k] = (this.inventory[k] || 0) + v;
      this.ui.markInventoryDirty();
      if (harvest) {
        this.ui.floatPickup(
          k, v, e.x, e.y, e.z, this.camera, this._canvasW, this._canvasH
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
    if (!this.input.mouseLocked && !this.craftOpen && !this.paused) {
      this.ui.setPointerHint(false, false);
    } else {
      this.ui.setPointerHint(this.input.mouseLocked, this.paused);
    }

    if (
      this.running &&
      !this.paused &&
      !this.input.mouseLocked &&
      !this.craftOpen &&
      !this._unlockHintShown
    ) {
      this._unlockHintShown = true;
      this.ui.toast('点击画面锁定鼠标，方便转向追猎', 'info');
    }

    this.focusTarget = this.world.getFocusTarget(
      p.x, p.z, CFG.player.interactRange, CFG.player.attackRange, this.phase === 'night'
    );
    const focus = this.focusTarget;
    const nearCampfire = this.buildSys?.getNearCampfire(p.x, p.z);
    const nearShelter = this.buildSys?.getNearShelter(p.x, p.z);
    const prompt = this.ui.getTargetPrompt(focus, this.inventory, {
      nearCampfire: !!nearCampfire,
      nearShelter: !!nearShelter,
      hunger: p.hunger,
      thirst: p.thirst,
    });
    this._statusHintCd -= CFG.ui.barsInterval;
    if (this._statusHintCd <= 0) {
      this._statusHintCd = 2.5;
      this.ui.setSurvivalHint(
        getStatusHint(p, this.inventory, {
          nearCampfire: !!nearCampfire,
          nearShelter: !!nearShelter,
          hasCampfire: this.buildSys?.placed?.some((b) => b.type === 'campfire'),
        })
      );
    }

    if (prompt && this.input.mouseLocked) {
      this.ui.setInteractPrompt(prompt.text, prompt.mode, prompt.hpRatio);
      this.ui.setCrosshairMode(prompt.mode === 'danger' ? 'danger' : prompt.mode, this.isAttacking);
    } else {
      this.ui.clearInteractPrompt();
      this.ui.setCrosshairMode('neutral', this.isAttacking);
    }

    if (focus?.entity && !focus.entity.dead) {
      const fe = focus.entity;
      const fd = Math.hypot(fe.x - p.x, fe.z - p.z);
      if (fd >= CFG.ui.focusMinDist) {
        const fy = fe.y + (fe.type === 'wolf' ? 0.35 : fe.type === 'deer' ? 0.45 : 0.25);
        const fkey = `${fe.id}:${prompt?.mode}:${Math.round(fe.x)}`;
        if (fkey !== this._lastFocusKey) {
          this._lastFocusKey = fkey;
          this.vfx.setFocus(fe.x, fy, fe.z, prompt?.mode || 'neutral', true);
        }
      } else if (this._lastFocusKey) {
        this._lastFocusKey = '';
        this.vfx.setFocus(0, 0, 0, 'neutral', false);
      }
    } else if (this._lastFocusKey) {
      this._lastFocusKey = '';
      this.vfx.setFocus(0, 0, 0, 'neutral', false);
    }
  }

  _refreshUISlow() {
    const p = this.player;
    this.ui.updateInventory(this.inventory);
    this.ui.updateCompass(this.yaw);
    this.ui.updateEquipment(this.equipment?.slots);
    if (!CFG.ui.showWorldLabels) return;
    const w = this._canvasW;
    const h = this._canvasH;
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
    if (this.time < 0.14) this.phase = 'dawn';
    else if (this.time < 0.68) this.phase = 'day';
    else if (this.time < 0.82) this.phase = 'dusk';
    else this.phase = 'night';

    if (this.phase === 'dusk' && prev !== 'dusk' && !this.duskWarned) {
      this.duskWarned = true;
      this.ui.toast('黄昏将至，快准备抵御黑夜！', 'warn');
    }
  }

  _updateLighting() {
    const pr = CFG.lighting[this.phase] || CFG.lighting.day;
    this.sun.position.y = pr.sunY;
    this.sun.intensity = pr.sun;
    this.ambient.intensity = pr.amb;
    this.hemi.intensity = pr.hemi;
    if (this.rim) this.rim.intensity = pr.rim ?? 0.38;
    this.hemi.color.setHex(0xc8e4ff);
    this.hemi.groundColor.setHex(this.phase === 'night' ? 0x4a6848 : 0x7ab86a);
    this.scene.background.setHex(pr.bg);
    this.scene.fog.color.setHex(pr.fog);
    this.scene.fog.near = pr.fogNear;
    this.scene.fog.far = pr.fogFar;
    if (this.world?.ground?.material) {
      this.world.ground.material.color.setHex(pr.ground);
    }
    if (this.world?.boundaryRing?.material) {
      const ringColor = this.phase === 'night' ? 0x6a8a9a : 0x8fcf7a;
      this.world.boundaryRing.material.color.setHex(ringColor);
      this.world.boundaryRing.material.opacity = this.phase === 'night' ? 0.35 : 0.5;
    }
  }

  _render() {
    const p = this.player;
    if (!Number.isFinite(p.y) && this.world) {
      const gy = this.world.getFootY(p.x, p.z);
      p.y = gy;
      p.groundY = gy;
    }
    const cam = CFG.camera;
    const dist = cam.dist;
    const height = cam.height + this.pitch * 1.5;

    const lift = this.human?.getFootLift?.() ?? 0;
    const bodyY = p.y + lift;
    this._camDesired.set(
      p.x - Math.sin(this.yaw) * dist,
      bodyY + height,
      p.z - Math.cos(this.yaw) * dist
    );

    if (this.world) {
      this._camGroundFrame += 1;
      if (this._camGroundFrame % 2 === 0) {
        this._camGroundY = this.world.getFootY(this._camDesired.x, this._camDesired.z, 0.3);
      }
      this._camDesired.y = Math.max(this._camDesired.y, this._camGroundY + 1.2);
    } else if (this.player.groundY != null) {
      this._camDesired.y = Math.max(this._camDesired.y, this.player.groundY + lift + 1.2);
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
    this._camTarget.set(p.x, bodyY + eyeH, p.z);
    this.camera.position.copy(this._camPos);
    this.camera.lookAt(this._camTarget);

    this.sun.position.set(p.x + 35, this.sun.position.y, p.z + 25);
    this.sun.target.position.set(p.x, p.y, p.z);

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
    this._canvasW = w;
    this._canvasH = h;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }
}
