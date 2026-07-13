import { Behavior, type BehaviorContext } from "../base-behavior";
import { nearestCreeper, entityDistance } from "../../util/entities";

const CREEPER_FLEE_RADIUS = 6;
const SAFE_DISTANCE = 8;

export class FleeCreeperBehavior extends Behavior {
  readonly name = "flee_creeper";
  readonly category = "survival" as const;

  isActive(ctx: BehaviorContext): boolean {
    return nearestCreeper(ctx.bot, CREEPER_FLEE_RADIUS) !== null;
  }

  onTick(ctx: BehaviorContext): void {
    const bot = ctx.bot;
    const creeper = nearestCreeper(bot, CREEPER_FLEE_RADIUS + 2);
    if (!creeper) return;
    const pos = bot.entity?.position;
    const cp = creeper.position;
    if (!pos || !cp) return;
    const dx = pos.x - cp.x;
    const dz = pos.z - cp.z;
    const yaw = Math.atan2(-dx, -dz);
    bot.look(yaw, 0, true);
    bot.setControlState("sprint", true);
    bot.setControlState("forward", true);
    if (entityDistance({ position: pos }, creeper) > SAFE_DISTANCE) {
      bot.clearControlStates();
    }
  }

  onStop(ctx: BehaviorContext): void {
    try {
      ctx.bot.clearControlStates();
    } catch {
      // ignore
    }
  }
}
