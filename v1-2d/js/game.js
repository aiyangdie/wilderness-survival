import { CONFIG, RECIPES, BUILDINGS, ITEMS } from './config.js';
import { World } from './world.js';
import { Player } from './player.js';
import { Inventory } from './inventory.js';
import { Input } from './input.js';
import { Renderer } from './renderer.js';
import { UI } from './ui.js';
import { updateEntities, damageEntity, tryCatch } from './entities.js';
import { placeBuilding, updateBuildings, canPlaceBuilding } from './building.js';
import { showToast } from './utils.js';

export class Game {
  constructor(canvas, uiRefs, overlays) {
    this.canvas = canvas;
    this.overlays = overlays;
    this.toast = uiRefs.toast;

    this.input = new Input(canvas);
    this.renderer = new Renderer(canvas);
    this.ui = new UI(uiRefs);
    this.world = new World();
    this.player = new Player(this.world.spawnX, this.world.spawnY);
    this.inventory = new Inventory();
    this.running = false;
    this.paused = true;

    this.day = 1;
    this.timeOfDay = 0;
    this.phase = 'dawn';
    this.nightSpawned = false;
    this.attackAnim = 0;
    this.lastTs = 0;

    this.dialogs = uiRefs.dialogs;
  }

  start() {
    this.world.generate();
    this.player = new Player(this.world.spawnX, this.world.spawnY);
    this.inventory = new Inventory();
    this.inventory.add('wood', 5);
    this.inventory.add('fiber', 3);
    this.day = 1;
    this.timeOfDay = 0;
    this.phase = 'dawn';
    this.nightSpawned = false;
    this.running = true;
    this.paused = false;
    this.overlays.start.classList.remove('visible');
    this.overlays.dead.classList.remove('visible');
    this.input.setBlocked(false);
    showToast(this.toast, '生存下去！采集资源，夜晚前建好庇护所。');
    this.lastTs = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  loop(ts) {
    if (!this.running) return;
    const dt = Math.min((ts - this.lastTs) / 1000, 0.05);
    this.lastTs = ts;

    if (!this.paused) this.update(dt);
    this.render();
    this.input.endFrame();

    if (this.running) requestAnimationFrame((t) => this.loop(t));
  }

  update(dt) {
    const { player, world, input, inventory } = this;

    this.updateTime(dt);
    player._inShelter = false;
    player.update(dt, input, world);

    const tool = inventory.getActiveTool(player.hotbarIndex);
    const damageMult = tool === 'spear' ? 1.4 : tool === 'axe' ? 1.2 : 1;

    if (input.wasPressed('Tab')) this.toggleDialog('inventory');
    if (input.wasPressed('c') || input.wasPressed('C')) this.toggleDialog('craft');
    if (input.wasPressed('b') || input.wasPressed('B')) this.toggleDialog('build');
    if (input.wasPressed('Escape')) {
      player.buildMode = null;
      this.closeDialogs();
    }

    const anyDialog = Object.values(this.dialogs).some((d) => d.open);
    input.setBlocked(anyDialog);
    if (anyDialog) return;

    input.mouse.worldX = input.mouse.x + this.renderer.camera.x;
    input.mouse.worldY = input.mouse.y + this.renderer.camera.y;

    if (player.buildMode && input.mouse.justDown) {
      this.tryPlaceBuilding();
    } else if (input.mouse.justDown && player.attackTimer <= 0) {
      this.handleAttack(damageMult);
    }

    if (input.wasPressed('e') || input.wasPressed('E')) {
      this.handleInteract(tool);
    }

    const isNight = this.phase === 'night';
    updateEntities(world, player, dt, isNight);
    updateBuildings(world, player, dt);

    if (isNight && !this.nightSpawned) {
      world.spawnNightMonsters();
      this.nightSpawned = true;
      showToast(this.toast, '夜晚降临！怪物出现了！');
    }

    if (player._inShelter && isNight) {
      player.heal(3 * dt);
    }

    for (const e of [...world.entities]) {
      if (e.dead) world.removeEntity(e);
    }

    if (!player.alive) this.gameOver();

    this.ui.updateHUD(player, this.day, this.phase, this.getDayLight());
    this.ui.renderHotbar(inventory, player.hotbarIndex);
    this.updateHints();
  }

  updateTime(dt) {
    this.timeOfDay += dt / CONFIG.dayLength;
    if (this.timeOfDay >= 1) {
      this.timeOfDay = 0;
      this.day += 1;
      this.player.score += 50;
      this.nightSpawned = false;
      showToast(this.toast, `第 ${this.day} 天开始了！`);
    }

    const p = CONFIG.phases;
    let t = this.timeOfDay;
    if (t < p.dawn) this.phase = 'dawn';
    else if (t < p.dawn + p.day) this.phase = 'day';
    else if (t < p.dawn + p.day + p.dusk) this.phase = 'dusk';
    else this.phase = 'night';
  }

  getDayLight() {
    const t = this.timeOfDay;
    const { dawn, day, dusk, night } = CONFIG.phases;
    if (this.phase === 'day') return 1;
    if (this.phase === 'dawn') return 0.55 + (t / dawn) * 0.45;
    if (this.phase === 'dusk') {
      const start = dawn + day;
      return 1 - ((t - start) / dusk) * 0.5;
    }
    return 0.35;
  }

  handleAttack(mult) {
    const { player, world, inventory } = this;
    const range = CONFIG.player.attackRange;
    const target = world.getAttackTarget(player.x, player.y, range);
    if (!target) return;

    player.attackTimer = CONFIG.player.attackCooldown;
    this.attackAnim = 0.2;
    const dmg = CONFIG.player.attackDamage * mult;
    const killed = damageEntity(target, dmg, inventory, (e) => {
      player.score += e.type === 'shadow' ? 30 : e.type === 'wolf' ? 20 : 8;
    });
    if (killed) showToast(this.toast, `击败了 ${target.def?.icon || target.type}`);
  }

  handleInteract(tool) {
    const { player, world, inventory } = this;
    if (player.interactCooldown > 0) return;

    const target = world.getInteractable(player.x, player.y, 40);
    if (target) {
      const bonus = tool === 'axe' && target.type === 'tree' ? 1.8 : tool === 'axe' && target.type === 'rock' ? 1.3 : 1;
      const dmg = 12 * bonus;
      const killed = damageEntity(target, dmg, inventory, () => {
        player.score += 5;
        showToast(this.toast, `获得资源`);
      });
      if (killed) player.interactCooldown = 0.3;
      return;
    }

    const animal = world.entities.find(
      (e) =>
        !e.dead &&
        (e.type === 'deer' || e.type === 'rabbit') &&
        Math.hypot(e.x - player.x, e.y - player.y) < 40
    );
    if (animal && tryCatch(player, animal, inventory)) {
      player.score += 15;
      showToast(this.toast, '捕获了动物！');
      world.removeEntity(animal);
      return;
    }

    const hot = inventory.getHotbarSlot(player.hotbarIndex);
    if (hot && player.eat(hot.id)) {
      if (inventory.remove(hot.id, 1)) showToast(this.toast, '吃了食物');
    }
  }

  tryPlaceBuilding() {
    const type = this.player.buildMode;
    const wx = this.input.mouse.worldX;
    const wy = this.input.mouse.worldY;
    const kit = BUILDINGS[type]?.kit;
    if (!kit || this.inventory.count(kit) <= 0) return;

    if (!canPlaceBuilding(this.world, type, wx, wy)) {
      showToast(this.toast, '无法在此建造');
      return;
    }

    if (placeBuilding(this.world, type, wx, wy)) {
      this.inventory.remove(kit, 1);
      this.player.score += 25;
      this.player.buildMode = null;
      showToast(this.toast, '建造完成！');
    }
  }

  craft(recipe) {
    if (!this.inventory.has(recipe.cost)) return;
    this.inventory.consume(recipe.cost);
    for (const [id, n] of Object.entries(recipe.output)) {
      this.inventory.add(id, n);
    }
    showToast(this.toast, `合成了 ${recipe.name}`);
    this.ui.renderCraftList(this.inventory, (r) => this.craft(r));
  }

  selectBuild(type) {
    this.dialogs.build.close();
    this.player.buildMode = type;
    showToast(this.toast, '点击地图放置建筑');
  }

  toggleDialog(name) {
    const d = this.dialogs[name];
    if (d.open) {
      d.close();
      return;
    }
    this.closeDialogs();
    if (name === 'craft') {
      this.ui.renderCraftList(this.inventory, (r) => this.craft(r));
    }
    if (name === 'build') {
      this.ui.renderBuildList(this.inventory, (t) => this.selectBuild(t));
    }
    if (name === 'inventory') {
      this.ui.renderInventory(this.inventory);
    }
    d.showModal();
  }

  closeDialogs() {
    Object.values(this.dialogs).forEach((d) => d.close());
  }

  updateHints() {
    if (this.player.buildMode) {
      this.ui.setHint('建造模式：点击放置 · Esc 取消');
      return;
    }
    const near = this.world.getInteractable(this.player.x, this.player.y, 40);
    if (near) this.ui.setHint(`按 E 采集 ${near.def?.name || near.type}`);
    else this.ui.setHint('WASD 移动 · 左键攻击 · E 交互/食用');
  }

  render() {
    const light = this.getDayLight();
    this.renderer.follow(this.player.x, this.player.y);
    this.renderer.clear(light);
    this.renderer.drawWorld(this.world, light);
    if (this.player.buildMode) {
      const valid = canPlaceBuilding(
        this.world,
        this.player.buildMode,
        this.input.mouse.worldX,
        this.input.mouse.worldY
      );
      this.renderer.drawPlacementPreview(
        this.player.buildMode,
        this.input.mouse.worldX,
        this.input.mouse.worldY,
        valid
      );
    }
    if (this.attackAnim > 0) this.attackAnim -= 0.016;
    this.renderer.drawPlayer(this.player, this.attackAnim);
    this.renderer.drawMinimap(this.world, this.player);
  }

  gameOver() {
    this.running = false;
    this.overlays.dead.classList.add('visible');
    document.getElementById('dead-days').textContent = String(this.day);
    document.getElementById('dead-score').textContent = String(this.player.score);
  }
}
