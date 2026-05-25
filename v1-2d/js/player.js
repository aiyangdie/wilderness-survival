import { CONFIG } from './config.js';
import { clamp } from './utils.js';

export class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.radius = 14;
    this.facing = 0;
    this.health = CONFIG.player.maxHealth;
    this.hunger = CONFIG.player.maxHunger;
    this.thirst = CONFIG.player.maxThirst;
    this.stamina = CONFIG.player.maxStamina;
    this.attackTimer = 0;
    this.interactCooldown = 0;
    this.invuln = 0;
    this.score = 0;
    this.hotbarIndex = 0;
    this.buildMode = null;
    this.alive = true;
  }

  update(dt, input, world) {
    if (!this.alive) return;

    const cfg = CONFIG.player;
    const move = input.getMovement();
    const sprint = input.isDown('Shift') && this.stamina > 5 && (move.x || move.y);
    let speed = cfg.speed * (sprint ? cfg.sprintMult : 1);

    const tool = null; // 工具加成在 game 里处理
    if (tool === 'axe') speed *= 0.95;

    let nx = this.x + move.x * speed * dt;
    let ny = this.y + move.y * speed * dt;

    if (!world.isBlocked(nx, this.y, this.radius)) this.x = nx;
    if (!world.isBlocked(this.x, ny, this.radius)) this.y = ny;

    if (move.x || move.y) {
      this.facing = Math.atan2(move.y, move.x);
    }

    if (sprint) {
      this.stamina = clamp(this.stamina - CONFIG.decay.staminaSprintCost * dt, 0, cfg.maxStamina);
      this.hunger = clamp(this.hunger - CONFIG.decay.hungerSprint * dt, 0, cfg.maxHunger);
    } else {
      this.stamina = clamp(this.stamina + CONFIG.decay.staminaRegen * dt, 0, cfg.maxStamina);
    }

    this.hunger = clamp(this.hunger - CONFIG.decay.hungerPerSec * dt, 0, cfg.maxHunger);
    this.thirst = clamp(this.thirst - CONFIG.decay.thirstPerSec * dt, 0, cfg.maxThirst);

    if (this.hunger <= 0 || this.thirst <= 0) {
      this.health = clamp(this.health - 8 * dt, 0, cfg.maxHealth);
    }

    if (this.attackTimer > 0) this.attackTimer -= dt;
    if (this.interactCooldown > 0) this.interactCooldown -= dt;
    if (this.invuln > 0) this.invuln -= dt;

    for (let i = 0; i < 5; i++) {
      if (input.wasPressed(String(i + 1))) this.hotbarIndex = i;
    }
  }

  takeDamage(amount) {
    if (this.invuln > 0 || !this.alive) return;
    this.health = clamp(this.health - amount, 0, CONFIG.player.maxHealth);
    this.invuln = 0.4;
    if (this.health <= 0) {
      this.alive = false;
    }
  }

  heal(amount) {
    this.health = clamp(this.health + amount, 0, CONFIG.player.maxHealth);
  }

  eat(itemId) {
    if (itemId === 'cooked_meat') {
      this.hunger = clamp(this.hunger + 35, 0, CONFIG.player.maxHunger);
      this.health = clamp(this.health + 10, 0, CONFIG.player.maxHealth);
      return true;
    }
    if (itemId === 'meat') {
      this.hunger = clamp(this.hunger + 15, 0, CONFIG.player.maxHunger);
      this.health = clamp(this.health - 5, 0, CONFIG.player.maxHealth);
      return true;
    }
    return false;
  }
}
