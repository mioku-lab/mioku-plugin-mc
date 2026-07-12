import { SurvivalBehavior, type BehaviorContext } from "../base-behavior";
import { nearestHostile } from "../../util/entities";
import { eatFood, findFood } from "../../util/inventory";

const HUNGER_THRESHOLD = 10;
const COMBAT_BLOCK_RADIUS = 4;

export class AutoEatBehavior extends SurvivalBehavior {
  readonly name = "auto_eat";
  private eating = false;

  shouldActivate(ctx: BehaviorContext): boolean {
    const bot = ctx.bot;
    if ((bot.food ?? 20) > HUNGER_THRESHOLD) return false;
    if (!findFood(bot)) return false;
    return nearestHostile(bot, COMBAT_BLOCK_RADIUS) === null;
  }

  async onTick(ctx: BehaviorContext): Promise<void> {
    if (this.eating) return;
    this.eating = true;
    try {
      await ctx.bot.pvp.stop();
    } catch {
      // ignore
    }
    try {
      await ctx.bot.setControlState("forward", false);
      await eatFood(ctx.bot);
    } finally {
      this.eating = false;
    }
  }

  onStop(): void {
    this.eating = false;
  }
}
