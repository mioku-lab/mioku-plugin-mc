import { Behavior, type BehaviorContext } from "../base-behavior";
import { goals } from "mineflayer-pathfinder";
import { nearestHostile } from "../../util/entities";

const FLEE_DISTANCE = 16;

export class FleeBehavior extends Behavior {
  readonly name = "flee";
  private fleeing = false;

  onTick(ctx: BehaviorContext): void {
    if (this.fleeing) return;
    const bot = ctx.bot;
    const pos = bot.entity?.position;
    if (!pos) return;

    const threat = nearestHostile(bot, 12);
    let gx: number;
    let gz: number;
    if (threat?.position) {
      const dx = pos.x - threat.position.x;
      const dz = pos.z - threat.position.z;
      const len = Math.hypot(dx, dz) || 1;
      gx = Math.floor(pos.x + (dx / len) * FLEE_DISTANCE);
      gz = Math.floor(pos.z + (dz / len) * FLEE_DISTANCE);
    } else {
      gx = Math.floor(pos.x + (Math.random() - 0.5) * FLEE_DISTANCE);
      gz = Math.floor(pos.z + (Math.random() - 0.5) * FLEE_DISTANCE);
    }

    this.fleeing = true;
    bot.setControlState("sprint", true);
    bot.pathfinder
      .goto(new goals.GoalXZ(gx, gz))
      .catch(() => {
        // ignore
      })
      .finally(() => {
        this.fleeing = false;
      });
  }

  onStop(ctx: BehaviorContext): void {
    try {
      ctx.bot.setControlState("sprint", false);
      ctx.bot.pathfinder.stop();
    } catch {
      // ignore
    }
  }
}
