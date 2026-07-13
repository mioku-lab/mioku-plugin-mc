import { Behavior, type BehaviorContext } from "../base-behavior";
import { nearestPassiveMob } from "../../util/entities";
import { equipSword } from "../../util/inventory";

const HUNT_RADIUS = 20;

export class FarmMobsBehavior extends Behavior {
  readonly name = "farm_mobs";
  readonly category = "movement" as const;
  private hunting = false;

  async onTick(ctx: BehaviorContext): Promise<void> {
    if (this.hunting) return;
    const target = nearestPassiveMob(ctx.bot, HUNT_RADIUS);
    if (!target) return;
    this.hunting = true;
    await equipSword(ctx.bot);
    ctx.bot.pvp
      .attack(target)
      .catch(() => {
        // ignore
      })
      .finally(() => {
        this.hunting = false;
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
