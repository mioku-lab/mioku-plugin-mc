import { Behavior, type BehaviorContext } from "../base-behavior";
import { nearestHostile, entityName, entityDistance } from "../../util/entities";
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
    const combat = ctx.bot.combat;
    if (!combat) return;
    if (!this.armed) {
      await equipSword(ctx.bot);
      this.armed = true;
    }
    const target = nearestHostile(ctx.bot, this.radius);
    if (!target) {
      this.attacking = false;
      combat.stop();
      return;
    }
    if (this.attacking) return;
    ctx.log(
      `defend 攻击 ${entityName(target)} (dist=${entityDistance(ctx.bot.entity, target).toFixed(1)})`,
    );
    this.attacking = true;
    combat
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
      ctx.bot.combat?.stop();
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