import { SurvivalBehavior, type BehaviorContext } from "../base-behavior";

export class EscapeLavaBehavior extends SurvivalBehavior {
  readonly name = "escape_lava";

  shouldActivate(ctx: BehaviorContext): boolean {
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
}
