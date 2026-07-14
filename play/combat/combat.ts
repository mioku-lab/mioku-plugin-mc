import type { Bot } from "mineflayer";
import { GoalFollow, type MovementsConfig } from "../path-engine";
import { entityName } from "../util/entities";
import { hasShield } from "../util/inventory";

const SHIELD_BLOCK_DURATION_MS = 2000;
const PRE_ATTACK_DELAY_MS = 50;
const POST_ATTACK_DELAY_MS = 50;
const ATTACK_COOLDOWN_TICKS = 12;
const REEQUIP_INTERVAL_MS = 3000;

export class Combat {
  private readonly bot: Bot;
  private target: any = null;
  private attacking = false;
  private timeToNextAttack = 0;
  private lastShieldBlockAt = 0;
  private lastEquipAt = 0;
  private resolveAttack: (() => void) | null = null;

  movements: MovementsConfig;
  followRange = 2;
  attackRange = 3.5;
  viewDistance = 128;

  constructor(bot: Bot, movements: MovementsConfig) {
    this.bot = bot;
    this.movements = movements;
    bot.on("physicTick", () => this.update());
  }

  attack(target: any): Promise<void> {
    return new Promise((resolve) => {
      if (this.target && this.target !== target) {
        this.stop();
      }
      this.target = target;
      this.attacking = false;
      this.timeToNextAttack = 0;
      this.lastShieldBlockAt = 0;
      this.lastEquipAt = 0;
      this.resolveAttack = resolve;

      void this.equipBestWeapon();
      const engine = (this.bot as any).pathEngine;
      if (engine) {
        try {
          engine.setGoal(new GoalFollow(target, this.followRange), true);
        } catch {
          // ignore
        }
      }
    });
  }

  stop(): void {
    if (this.resolveAttack) {
      this.resolveAttack();
      this.resolveAttack = null;
    }
    this.target = null;
    this.attacking = false;
    const engine = (this.bot as any).pathEngine;
    if (engine) {
      try {
        engine.setGoal(null);
      } catch {
        // ignore
      }
    }
    if (this.lastShieldBlockAt > 0) {
      try {
        (this.bot as any).deactivateItem();
      } catch {
        // ignore
      }
      this.lastShieldBlockAt = 0;
    }
  }

  isInCombat(): boolean {
    return this.target !== null;
  }

  getTarget(): any | null {
    return this.target;
  }

  private async equipBestWeapon(): Promise<void> {
    try {
      const items = this.bot.inventory?.items?.() ?? [];
      const sword = items.find((i: any) => /_sword$/.test(i.name));
      const axe = items.find((i: any) => /_axe$/.test(i.name) && !/pickaxe/.test(i.name));
      const best = sword ?? axe;
      if (best) {
        const held = this.bot.heldItem;
        if (!held || held.type !== best.type) {
          await this.bot.equip(best, "hand");
        }
      }
    } catch {
      // ignore
    }
  }

  private update(): void {
    if (!this.target) return;
    const entity = this.bot.entity;
    if (!entity) return;

    if (!this.target.position) {
      this.stop();
      return;
    }

    const targetPos = this.target.position;
    const dist = Math.sqrt(
      (targetPos.x - entity.position.x) ** 2 +
        (targetPos.y - entity.position.y) ** 2 +
        (targetPos.z - entity.position.z) ** 2,
    );

    if (dist > this.viewDistance) {
      this.stop();
      return;
    }

    this.handleShield(targetPos, dist);

    if (dist <= this.attackRange) {
      if (!this.attacking && this.timeToNextAttack <= 0) {
        const now = Date.now();
        if (now - this.lastEquipAt > REEQUIP_INTERVAL_MS) {
          this.lastEquipAt = now;
          void this.equipBestWeapon();
        }
        this.attacking = true;
        this.attemptAttack(targetPos);
      }
    } else {
      this.attacking = false;
    }

    if (this.timeToNextAttack > 0) this.timeToNextAttack--;
  }

  private handleShield(targetPos: any, _dist: number): void {
    if (entityName(this.target) !== "creeper") {
      if (this.lastShieldBlockAt > 0 && Date.now() - this.lastShieldBlockAt > SHIELD_BLOCK_DURATION_MS) {
        try {
          (this.bot as any).deactivateItem();
        } catch {
          // ignore
        }
        this.lastShieldBlockAt = 0;
      }
      return;
    }

    const fuseActive = this.target.metadata?.[16] === 1;
    if (fuseActive && hasShield(this.bot) && this.lastShieldBlockAt === 0) {
      this.lastShieldBlockAt = Date.now();
      try {
        (this.bot as any).pathEngine?.stop();
        (this.bot as any).lookAt(targetPos.offset(0, 1, 0), true);
        (this.bot as any).activateItem(true);
      } catch {
        // ignore
      }
      return;
    }

    if (this.lastShieldBlockAt > 0 && Date.now() - this.lastShieldBlockAt > SHIELD_BLOCK_DURATION_MS) {
      try {
        (this.bot as any).deactivateItem();
      } catch {
        // ignore
      }
      this.lastShieldBlockAt = 0;
    }
  }

  private async attemptAttack(targetPos: any): Promise<void> {
    const target = this.target;
    if (!target) {
      this.attacking = false;
      return;
    }
    const shield = hasShield(this.bot);
    try {
      if (shield) {
        try {
          (this.bot as any).deactivateItem();
        } catch {
          // ignore
        }
        await new Promise((r) => setTimeout(r, PRE_ATTACK_DELAY_MS));
      }
      const height = target.height ?? 1;
      try {
        await (this.bot as any).lookAt(targetPos.offset(0, height, 0), true);
      } catch {
        // ignore
      }
      try {
        await (this.bot as any).attack(target);
      } catch {
        // ignore
      }
      if (shield) {
        await new Promise((r) => setTimeout(r, POST_ATTACK_DELAY_MS));
        try {
          (this.bot as any).activateItem(true);
        } catch {
          // ignore
        }
      }
      this.timeToNextAttack = ATTACK_COOLDOWN_TICKS;
    } catch {
      // ignore
    } finally {
      this.attacking = false;
    }
  }
}