import { Behavior, type BehaviorContext } from "../base-behavior";
import { goals } from "mineflayer-pathfinder";
import { entityDistance } from "../../util/entities";

export class FollowPlayerBehavior extends Behavior {
  readonly name = "follow";
  readonly category = "movement" as const;
  private target = "";
  private distance = 3;

  protected onConfigure(params: Record<string, string>): void {
    this.target = params.target ?? "";
    this.distance = Number(params.distance) || 3;
  }

  isActive(ctx: BehaviorContext): boolean {
    return !!this.target && !!ctx.bot.players[this.target]?.entity;
  }

  onTick(ctx: BehaviorContext): void {
    const bot = ctx.bot;
    const player = bot.players[this.target]?.entity;
    if (!player) return;
    if (bot.pathfinder.isMoving()) return;
    const dist = entityDistance(bot.entity, player);
    if (dist > this.distance + 1) {
      try {
        bot.pathfinder.setGoal(new goals.GoalFollow(player, this.distance), true);
      } catch (e) {
        ctx.log(`follow 寻路失败: ${e}`);
      }
    }
  }

  onStop(ctx: BehaviorContext): void {
    try {
      ctx.bot.pathfinder.stop();
    } catch {
      // ignore
    }
  }
}
