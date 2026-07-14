import { Behavior, type BehaviorContext } from "../base-behavior";
import { nearestHostile, entityName, entityDistance } from "../../util/entities";
import { equipSword, hasShield } from "../../util/inventory";

export class SelfDefenseBehavior extends Behavior {
  readonly name = "defend";
  readonly category = "combat" as const;
  private radius = 8;
  private armed = false;
  private attacking = false;
  private _origCheckExplosion: (() => void) | undefined = undefined;

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
      this.restoreExplosionCheck(ctx);
      try {
        await ctx.bot.pvp.stop();
      } catch {
        // ignore
      }
      return;
    }
    this.maybeDisableExplosionCheck(ctx, target);
    if (this.attacking) return;
    ctx.log(`defend 攻击 ${entityName(target)} (dist=${entityDistance(ctx.bot.entity, target).toFixed(1)})`);
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

  private maybeDisableExplosionCheck(ctx: BehaviorContext, target: any): void {
    const pvp = ctx.bot.pvp as any;
    const isCreeper = entityName(target) === "creeper";
    if (isCreeper && hasShield(ctx.bot)) {
      if (this._origCheckExplosion === undefined) {
        this._origCheckExplosion = pvp.checkExplosion;
      }
      pvp.checkExplosion = () => {};
    } else {
      this.restoreExplosionCheck(ctx);
    }
  }

  private restoreExplosionCheck(ctx: BehaviorContext): void {
    const pvp = ctx.bot.pvp as any;
    if (this._origCheckExplosion !== undefined) {
      pvp.checkExplosion = this._origCheckExplosion;
      this._origCheckExplosion = undefined;
    }
  }

  onStop(ctx: BehaviorContext): void {
    this.restoreExplosionCheck(ctx);
    try {
      ctx.bot.pvp.stop();
    } catch {
      // ignore
    }
  }

  contributesState(): Record<string, unknown> {
    return {
      radius: this.radius,
      armed: this.armed,
      attacking: this.attacking,
    };
  }
}
