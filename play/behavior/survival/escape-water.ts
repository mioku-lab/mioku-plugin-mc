import { Behavior, type BehaviorContext } from "../base-behavior";

export class EscapeWaterBehavior extends Behavior {
  readonly name = "escape_water";
  readonly category = "survival" as const;

  isActive(ctx: BehaviorContext): boolean {
    return (ctx.bot.oxygenLevel ?? 20) <= 0;
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
}
