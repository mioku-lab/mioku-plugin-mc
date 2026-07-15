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
  dirt: (n) => /^(dirt|grass_block|coarse_dirt|rooted_dirt|podzol|mycelium)$/.test(n),
};

export class GatherResourceBehavior extends Behavior {
  readonly name = "gather";
  readonly category = "movement" as const;
  private resource = "wood";
  private targetCount = 1;
  private gathered = 0;
  private mining = false;
  private missingSince = 0;

  protected onConfigure(params: Record<string, string>): void {
    this.resource = params.resource ?? "wood";
    this.targetCount = Math.max(1, Number(params.count) || 1);
  }

  onTick(ctx: BehaviorContext): void {
    if (this.mining) return;
    const matcher = RESOURCE_MATCHERS[this.resource];
    if (!matcher) return;
    const block = ctx.bot.findBlock({
      matching: (b: any) => !!b && matcher(b.name),
      maxDistance: 32,
    } as any);
    if (!block) {
      if (!this.missingSince) this.missingSince = Date.now();
      if (Date.now() - this.missingSince >= 5_000) {
        this.mission?.block("resource_not_found", `附近找不到资源 ${this.resource}`, {
          resource: this.resource,
          gathered: this.gathered,
          targetCount: this.targetCount,
        });
      }
      return;
    }
    this.missingSince = 0;

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
        const emptySlots = (ctx.bot.inventory as any)?.emptySlotCount?.();
        if (emptySlots === 0) {
          this.mission?.block("inventory_full", "背包已满，无法继续采集", {
            resource: this.resource,
            gathered: this.gathered,
            targetCount: this.targetCount,
          });
          return;
        }
        const needsTool = this.resource !== "wood" && this.resource !== "dirt";
        const equipped = await equipToolFor(ctx.bot, this.resource);
        if (needsTool && !equipped) {
          this.mission?.block("missing_tool", `采集 ${this.resource} 需要合适的镐`, {
            resource: this.resource,
            gathered: this.gathered,
            targetCount: this.targetCount,
          });
          return;
        }
        if (this.mission && !this.mission.isCurrent()) return;
        await engine.goto(
          new GoalGetToBlock(block.position.x, block.position.y, block.position.z),
        );
        if (this.mission && !this.mission.isCurrent()) return;
        await ctx.bot.dig(block);
        this.gathered++;
        const progress = {
          resource: this.resource,
          gathered: this.gathered,
          targetCount: this.targetCount,
        };
        this.mission?.progress(progress);
        if (this.gathered >= this.targetCount) {
          this.mission?.succeed(`已采集 ${this.gathered} 个 ${this.resource}`, progress);
        }
      } catch (e) {
        ctx.log(`gather 失败: ${e}`);
        const message = String(e);
        this.mission?.fail(
          /timeout/i.test(message) ? "path_timeout" : "path_unreachable",
          message,
          { resource: this.resource, gathered: this.gathered, targetCount: this.targetCount },
        );
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
      targetCount: this.targetCount,
      gathered: this.gathered,
      mining: this.mining,
    };
  }
}
