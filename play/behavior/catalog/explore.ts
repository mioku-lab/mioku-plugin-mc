import { Behavior, type BehaviorContext } from "../base-behavior";
import { GoalXZ } from "../../path-engine";

const EXPLORE_HALF_RANGE = 12;
const GOTO_TIMEOUT_MS = 10_000;

export class ExploreBehavior extends Behavior {
  readonly name = "explore";
  readonly category = "movement" as const;
  private exploring = false;

  onTick(ctx: BehaviorContext): void {
    if (this.exploring) return;
    const engine = ctx.bot.pathEngine;
    if (!engine) return;
    const pos = ctx.bot.entity?.position;
    if (!pos) return;
    const gx = Math.floor(pos.x + (Math.random() - 0.5) * EXPLORE_HALF_RANGE * 2);
    const gz = Math.floor(pos.z + (Math.random() - 0.5) * EXPLORE_HALF_RANGE * 2);
    this.exploring = true;
    ctx.log(`explore -> (${gx},${gz})`);

    const gotoPromise = engine.goto(new GoalXZ(gx, gz));
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        engine.stop();
      } catch {
        // ignore
      }
    }, GOTO_TIMEOUT_MS);

    gotoPromise
      .then(() => {
        if (!timedOut) ctx.log(`explore 到达 (${gx},${gz})`);
      })
      .catch((e: any) => {
        ctx.log(`explore 放弃 (${gx},${gz}): ${e}`);
      })
      .finally(() => {
        clearTimeout(timer);
        try {
          engine.setGoal(null);
        } catch {
          // ignore
        }
        this.exploring = false;
      });
  }

  onStop(ctx: BehaviorContext): void {
    try {
      ctx.bot.pathEngine?.stop();
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