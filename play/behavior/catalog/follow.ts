import { Behavior, type BehaviorContext } from "../base-behavior";
import { goals } from "mineflayer-pathfinder";

const RETARGET_MS = 2_000;

export class FollowPlayerBehavior extends Behavior {
  readonly name = "follow";
  private readonly target: string;
  private readonly distance: number;
  private retargetAt = 0;

  constructor(params: Record<string, string>) {
    super();
    this.target = params.target ?? "";
    this.distance = Number(params.distance) || 3;
  }

  onStart(): void {
    this.retargetAt = 0;
  }

  onTick(ctx: BehaviorContext): void {
    const bot = ctx.bot;
    const player = bot.players[this.target]?.entity;
    if (!player) return;
    if (bot.pathfinder.isMoving()) return;
    const now = Date.now();
    if (now < this.retargetAt) return;
    this.retargetAt = now + RETARGET_MS;
    bot.pathfinder.goto(new goals.GoalFollow(player, this.distance)).catch(() => {
      // ignore pathing errors
    });
  }

  onStop(ctx: BehaviorContext): void {
    try {
      ctx.bot.pathfinder.stop();
    } catch {
      // ignore
    }
  }
}
