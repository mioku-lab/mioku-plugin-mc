import { Behavior, type BehaviorContext } from "../base-behavior";
import { GoalXZ } from "../../path-engine";
import { nearestCreeper } from "../../util/entities";
import { hasShield } from "../../util/inventory";

const CREEPER_FLEE_RADIUS = 6;
const FLEE_DISTANCE = 10;
const FLEE_TIMEOUT_MS = 5_000;

export class FleeCreeperBehavior extends Behavior {
  readonly name = "flee_creeper";
  readonly category = "survival" as const;
  private fleeing = false;

  isActive(ctx: BehaviorContext): boolean {
    if (hasShield(ctx.bot)) return false;
    return nearestCreeper(ctx.bot, CREEPER_FLEE_RADIUS) !== null;
  }

  onTick(ctx: BehaviorContext): void {
    if (this.fleeing) return;
    const bot = ctx.bot;
    const engine = bot.pathEngine;
    if (!engine) return;
    const creeper = nearestCreeper(bot, CREEPER_FLEE_RADIUS + 2);
    if (!creeper) return;
    const pos = bot.entity?.position;
    const cp = creeper.position;
    if (!pos || !cp) return;
    const dx = pos.x - cp.x;
    const dz = pos.z - cp.z;
    const len = Math.hypot(dx, dz) || 1;
    const tx = Math.floor(pos.x + (dx / len) * FLEE_DISTANCE);
    const tz = Math.floor(pos.z + (dz / len) * FLEE_DISTANCE);
    this.fleeing = true;
    ctx.log(`flee_creeper -> (${tx},${tz})`);
    const timer = setTimeout(() => {
      try {
        engine.stop();
      } catch {
        // ignore
      }
    }, FLEE_TIMEOUT_MS);
    engine
      .goto(new GoalXZ(tx, tz))
      .catch(() => {
        // ignore
      })
      .finally(() => {
        clearTimeout(timer);
        try {
          engine.setGoal(null);
        } catch {
          // ignore
        }
        this.fleeing = false;
      });
  }

  onStop(ctx: BehaviorContext): void {
    try {
      ctx.bot.pathEngine?.stop();
    } catch {
      // ignore
    }
    this.fleeing = false;
  }

  contributesState(): Record<string, unknown> {
    return {
      active: true,
      hazard: "creeper",
      fleeing: this.fleeing,
    };
  }
}