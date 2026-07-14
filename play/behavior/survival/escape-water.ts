import { Behavior, type BehaviorContext } from "../base-behavior";

export class EscapeWaterBehavior extends Behavior {
  readonly name = "escape_water";
  readonly category = "survival" as const;

  isActive(ctx: BehaviorContext): boolean {
    return (ctx.bot.oxygenLevel ?? 20) <= 0;
  }

  onStart(ctx: BehaviorContext): void {
    try { ctx.bot.pathEngine?.setGoal(null); } catch { /* ignore */ }
  }

  onTick(ctx: BehaviorContext): void {
    ctx.bot.setControlState("jump", true);
    ctx.bot.setControlState("forward", true);
  }

  onStop(ctx: BehaviorContext): void {
    try {
      ctx.bot.clearControlStates();
    } catch {
      // ignore
    }
  }

  contributesState(ctx: BehaviorContext): Record<string, unknown> {
    return {
      active: true,
      oxygen: ctx.bot.oxygenLevel ?? 0,
      drowning: true,
    };
  }
}
