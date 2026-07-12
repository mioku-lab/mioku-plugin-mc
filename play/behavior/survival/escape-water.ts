import { SurvivalBehavior, type BehaviorContext } from "../base-behavior";

export class EscapeWaterBehavior extends SurvivalBehavior {
  readonly name = "escape_water";

  shouldActivate(ctx: BehaviorContext): boolean {
    const bot = ctx.bot;
    const oxygen = bot.oxygenLevel ?? 20;
    return oxygen <= 0;
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
