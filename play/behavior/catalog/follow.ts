import { Behavior, type BehaviorContext } from "../base-behavior";
import { GoalFollow } from "../../path-engine";
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
    const engine = bot.pathEngine;
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
    if (!engine) return;
    if (engine.isMoving()) return;
    const now = Date.now();
    if (now - this.lastGoalAt < 2000) return;
    if (this.lastDist > this.distance + 1) {
      try {
        engine.setGoal(new GoalFollow(player, this.distance), true);
        this.lastGoalAt = now;
        ctx.log(`follow -> ${this.target} (dist=${this.lastDist.toFixed(1)}, goal=${this.distance})`);
      } catch (e) {
        ctx.log(`follow 寻路失败: ${e}`);
      }
    }
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
      target: this.target || null,
      distance: this.distance,
      lastObservedDist: this.lastDist < 0 ? null : Math.round(this.lastDist * 10) / 10,
    };
  }
}