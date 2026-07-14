import { Behavior, type BehaviorContext } from "../base-behavior";
import { GoalGetToBlock } from "../../path-engine";
import { equipToolFor } from "../../util/inventory";

const RESOURCE_MATCHERS: Record<string, (name: string) => boolean> = {
  wood: (n) => /_log$/.test(n),
  stone: (n) =>
    /^(stone|cobblestone|andesite|diorite|granite|deepslate|tuff|basalt|calcite|dripstone_block)/.test(
      n,
    ),
  coal: (n) => /coal_ore/.test(n),
  iron: (n) => /iron_ore/.test(n),
};

export class GatherResourceBehavior extends Behavior {
  readonly name = "gather";
  readonly category = "movement" as const;
  private resource = "wood";
  private mining = false;

  protected onConfigure(params: Record<string, string>): void {
    this.resource = params.resource ?? "wood";
  }

  onTick(ctx: BehaviorContext): void {
    if (this.mining) return;
    const matcher = RESOURCE_MATCHERS[this.resource];
    if (!matcher) return;
    const block = ctx.bot.findBlock({
      matching: (b: any) => !!b && matcher(b.name),
      maxDistance: 32,
    } as any);
    if (!block) return;

    const engine = ctx.bot.pathEngine;
    if (!engine) return;

    this.mining = true;
    void (async () => {
      const timer = setTimeout(() => {
        try {
          engine.stop();
        } catch {
          // ignore
        }
      }, 12_000);
      try {
        await equipToolFor(ctx.bot, this.resource);
        await engine.goto(
          new GoalGetToBlock(block.position.x, block.position.y, block.position.z),
        );
        await ctx.bot.dig(block);
      } catch (e) {
        ctx.log(`gather 失败: ${e}`);
      } finally {
        clearTimeout(timer);
        try {
          engine.setGoal(null);
        } catch {
          // ignore
        }
        this.mining = false;
      }
    })();
  }

  onStop(ctx: BehaviorContext): void {
    try {
      ctx.bot.pathEngine?.stop();
    } catch {
      // ignore
    }
  }

  contributesState(): Record<string, unknown> {
    return {
      resource: this.resource,
      mining: this.mining,
    };
  }
}