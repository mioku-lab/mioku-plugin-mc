import { Behavior, type BehaviorContext } from "../base-behavior";

export class EscapeLavaBehavior extends Behavior {
  readonly name = "escape_lava";
  readonly category = "survival" as const;

  isActive(ctx: BehaviorContext): boolean {
    const bot = ctx.bot;
    const pos = bot.entity?.position;
    if (!pos) return false;
    const feet = bot.blockAt(pos);
    const below = bot.blockAt(pos.offset(0, -1, 0));
    const isDanger = (b: any) => {
      const n = String(b?.name ?? "").toLowerCase();
      return n === "lava" || n === "fire" || n === "flowing_lava";
    };
    return isDanger(feet) || isDanger(below);
  }

  onStart(ctx: BehaviorContext): void {
    try { ctx.bot.pathfinder.setGoal(null); } catch { /* ignore */ }
  }

  onTick(ctx: BehaviorContext): void {
    ctx.bot.setControlState("jump", true);
    ctx.bot.setControlState("sprint", true);
    ctx.bot.setControlState("forward", true);
  }

  onStop(ctx: BehaviorContext): void {
    try {
      ctx.bot.clearControlStates();
    } catch {
      // ignore
    }
  }

  contributesState(): Record<string, unknown> {
    return {
      active: true,
      hazard: "lava_or_fire",
    };
  }
}
