import { Behavior, type BehaviorContext } from "../base-behavior";
import { nearestHostile } from "../../util/entities";
import { eatFood, findFood } from "../../util/inventory";

const HUNGER_THRESHOLD = 10;
const COMBAT_BLOCK_RADIUS = 5;

export class AutoEatBehavior extends Behavior {
  readonly name = "auto_eat";
  readonly category = "maintenance" as const;
  private eating = false;

  isActive(ctx: BehaviorContext): boolean {
    const bot = ctx.bot;
    if ((bot.food ?? 20) > HUNGER_THRESHOLD) return false;
    if (!findFood(bot)) return false;
    return nearestHostile(bot, COMBAT_BLOCK_RADIUS) === null;
  }

  async onTick(ctx: BehaviorContext): Promise<void> {
    if (this.eating) return;
    this.eating = true;
    try {
      ctx.bot.clearControlStates();
    } catch {
      // ignore
    }
    try {
      await eatFood(ctx.bot);
    } finally {
      this.eating = false;
    }
  }

  onStop(): void {
    this.eating = false;
  }

  contributesState(ctx: BehaviorContext): Record<string, unknown> {
    return {
      eating: this.eating,
      food: ctx.bot.food ?? 0,
      foodLow: (ctx.bot.food ?? 20) <= HUNGER_THRESHOLD,
    };
  }
}
