import { Behavior, type BehaviorContext } from "../base-behavior";
import { nearestHostile } from "../../util/entities";
import { equipSword } from "../../util/inventory";

export class SelfDefenseBehavior extends Behavior {
  readonly name = "defend";
  readonly category = "combat" as const;
  private radius = 8;
  private armed = false;
  private attacking = false;

  protected onConfigure(params: Record<string, string>): void {
    this.radius = Number(params.radius) || 8;
  }

  isActive(ctx: BehaviorContext): boolean {
    return nearestHostile(ctx.bot, this.radius) !== null;
  }

  onStart(): void {
    this.armed = false;
    this.attacking = false;
  }

  async onTick(ctx: BehaviorContext): Promise<void> {
    if (!this.armed) {
      await equipSword(ctx.bot);
      this.armed = true;
    }
    const target = nearestHostile(ctx.bot, this.radius);
    if (!target) {
      this.attacking = false;
      try {
        await ctx.bot.pvp.stop();
      } catch {
        // ignore
      }
      return;
    }
    if (this.attacking) return;
    this.attacking = true;
    ctx.bot.pvp
      .attack(target)
      .catch(() => {
        // ignore
      })
      .finally(() => {
        this.attacking = false;
      });
  }

  onStop(ctx: BehaviorContext): void {
    try {
      ctx.bot.pvp.stop();
    } catch {
      // ignore
    }
  }
}
