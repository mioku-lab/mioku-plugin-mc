import { Behavior, type BehaviorContext } from "../base-behavior";
import { goals } from "mineflayer-pathfinder";

const EXPLORE_RANGE = 30;

export class ExploreBehavior extends Behavior {
  readonly name = "explore";
  readonly category = "movement" as const;
  private exploring = false;

  onTick(ctx: BehaviorContext): void {
    if (this.exploring) return;
    const pos = ctx.bot.entity?.position;
    if (!pos) return;
    const gx = Math.floor(pos.x + (Math.random() - 0.5) * EXPLORE_RANGE * 2);
    const gz = Math.floor(pos.z + (Math.random() - 0.5) * EXPLORE_RANGE * 2);
    this.exploring = true;
    ctx.bot.pathfinder
      .goto(new goals.GoalXZ(gx, gz))
      .catch(() => {
        // ignore
      })
      .finally(() => {
        this.exploring = false;
      });
  }

  onStop(ctx: BehaviorContext): void {
    try {
      ctx.bot.pathfinder.stop();
    } catch {
      // ignore
    }
  }
}
