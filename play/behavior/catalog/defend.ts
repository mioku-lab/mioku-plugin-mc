import { Behavior, type BehaviorContext } from "../base-behavior";
import { nearestHostile } from "../../util/entities";
import { equipSword } from "../../util/inventory";

export class SelfDefenseBehavior extends Behavior {
  readonly name = "defend";
  private readonly radius: number;
  private armed = false;
  private attacking = false;

  constructor(params: Record<string, string>) {
    super();
    this.radius = Number(params.radius) || 8;
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
    if (target) {
      if (!this.attacking) {
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
      return;
    }
    this.attacking = false;
    try {
      await ctx.bot.pvp.stop();
    } catch {
      // ignore
    }
  }

  onStop(ctx: BehaviorContext): void {
    try {
      ctx.bot.pvp.stop();
    } catch {
      // ignore
    }
  }
}
