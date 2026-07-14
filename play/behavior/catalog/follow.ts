import { Behavior, type BehaviorContext } from "../base-behavior";
import { goals } from "mineflayer-pathfinder";
import { entityDistance } from "../../util/entities";

export class FollowPlayerBehavior extends Behavior {
  readonly name = "follow";
  readonly category = "movement" as const;
  private target = "";
  private distance = 3;
  private lastDist = -1;
  private warnedNoEntity = false;
  private lastGoalAt = 0;

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
    if (!player) {
      if (!this.warnedNoEntity) {
        ctx.log(`follow 找不到玩家 ${this.target} 的实体（不在视野/未加载）`);
        this.warnedNoEntity = true;
      }
      return;
    }
    this.warnedNoEntity = false;
    this.lastDist = entityDistance(bot.entity, player);
    if (bot.pathfinder.isMoving()) return;
    if (this.lastDist > this.distance + 1) {
      try {
        bot.pathfinder.setGoal(new goals.GoalFollow(player, this.distance), true);
        const now = Date.now();
        if (now - this.lastGoalAt > 3_000) {
          ctx.log(`follow -> ${this.target} (dist=${this.lastDist.toFixed(1)}, goal=${this.distance})`);
          this.lastGoalAt = now;
        }
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

  contributesState(): Record<string, unknown> {
    return {
      target: this.target || null,
      distance: this.distance,
      lastObservedDist: this.lastDist < 0 ? null : Math.round(this.lastDist * 10) / 10,
    };
  }
}
