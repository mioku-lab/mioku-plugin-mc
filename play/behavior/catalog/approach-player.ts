import { Behavior, type BehaviorContext } from "../base-behavior";
import { GoalFollow } from "../../path-engine";
import { entityDistance } from "../../util/entities";

export class ApproachPlayerBehavior extends Behavior {
  readonly name = "approach_player";
  readonly category = "movement" as const;
  private target = "";
  private distance = 3;
  private lastGoalAt = 0;
  private missingSince = 0;

  protected onConfigure(params: Record<string, string>): void {
    this.target = params.target ?? "";
    this.distance = Math.max(1, Number(params.distance) || 3);
  }

  isActive(): boolean {
    return !!this.target;
  }

  onTick(ctx: BehaviorContext): void {
    const player = ctx.bot.players[this.target]?.entity;
    if (!player) {
      if (!this.missingSince) this.missingSince = Date.now();
      if (Date.now() - this.missingSince >= 5_000) {
        this.mission?.block("target_not_found", `找不到玩家 ${this.target}`);
      }
      return;
    }
    this.missingSince = 0;
    const distance = entityDistance(ctx.bot.entity, player);
    this.mission?.progress({
      target: this.target,
      distance: Math.round(distance * 10) / 10,
    });
    if (distance <= this.distance) {
      this.mission?.succeed(`已接近玩家 ${this.target}`, {
        target: this.target,
        distance,
      });
      return;
    }
    const engine = ctx.bot.pathEngine;
    if (!engine || engine.isMoving() || Date.now() - this.lastGoalAt < 2_000)
      return;
    try {
      engine.setGoal(new GoalFollow(player, this.distance), true);
      this.lastGoalAt = Date.now();
    } catch (error) {
      this.mission?.fail("path_unreachable", String(error), {
        target: this.target,
        distance,
      });
    }
  }

  onStop(ctx: BehaviorContext): void {
    try {
      ctx.bot.pathEngine?.stop();
    } catch {
      // ignore
    }
  }
}
