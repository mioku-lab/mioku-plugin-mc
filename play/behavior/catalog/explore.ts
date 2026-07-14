import { Behavior, type BehaviorContext } from "../base-behavior";
import { goals } from "mineflayer-pathfinder";

const EXPLORE_HALF_RANGE = 12;
const GOTO_TIMEOUT_MS = 10_000;

export class ExploreBehavior extends Behavior {
  readonly name = "explore";
  readonly category = "movement" as const;
  private exploring = false;

  onTick(ctx: BehaviorContext): void {
    if (this.exploring) return;
    const pos = ctx.bot.entity?.position;
    if (!pos) return;
    const gx = Math.floor(pos.x + (Math.random() - 0.5) * EXPLORE_HALF_RANGE * 2);
    const gz = Math.floor(pos.z + (Math.random() - 0.5) * EXPLORE_HALF_RANGE * 2);
    this.exploring = true;
    ctx.log(`explore -> (${gx},${gz})`);

    const gotoPromise = ctx.bot.pathfinder.goto(new goals.GoalXZ(gx, gz));
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        ctx.bot.pathfinder.stop();
      } catch {
        // ignore
      }
    }, GOTO_TIMEOUT_MS);

    gotoPromise
      .then(() => {
        if (!timedOut) ctx.log(`explore 到达 (${gx},${gz})`);
      })
      .catch((e) => {
        ctx.log(`explore 放弃 (${gx},${gz}): ${e}`);
      })
      .finally(() => {
        clearTimeout(timer);
        this.exploring = false;
      });
  }

  onStop(ctx: BehaviorContext): void {
    try {
      ctx.bot.pathfinder.stop();
    } catch {
      // ignore
    }
    this.exploring = false;
  }

  contributesState(): Record<string, unknown> {
    return {
      exploring: this.exploring,
    };
  }
}
