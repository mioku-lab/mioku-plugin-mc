import { Behavior, type BehaviorContext } from "../base-behavior";
import { goals } from "mineflayer-pathfinder";
import { nearestHostile } from "../../util/entities";
import { equipSword } from "../../util/inventory";

const RETARGET_MS = 2_000;
const THREAT_RADIUS = 6;

export class FollowAssistBehavior extends Behavior {
  readonly name = "follow_assist";
  private readonly target: string;
  private readonly distance: number;
  private retargetAt = 0;
  private attacking = false;

  constructor(params: Record<string, string>) {
    super();
    this.target = params.target ?? "";
    this.distance = Number(params.distance) || 4;
  }

  async onTick(ctx: BehaviorContext): Promise<void> {
    const bot = ctx.bot;
    const player = bot.players[this.target]?.entity;
    if (!player) return;

    const threat = nearestHostile(bot, THREAT_RADIUS);
    if (threat) {
      if (!this.attacking) {
        this.attacking = true;
        await equipSword(bot);
        bot.pvp
          .attack(threat)
          .catch(() => {
            // ignore
          })
          .finally(() => {
            this.attacking = false;
          });
      }
      return;
    }
    this.attacking = false;
    try {
      await bot.pvp.stop();
    } catch {
      // ignore
    }
    if (bot.pathfinder.isMoving()) return;
    const now = Date.now();
    if (now < this.retargetAt) return;
    this.retargetAt = now + RETARGET_MS;
    bot.pathfinder.goto(new goals.GoalFollow(player, this.distance)).catch(() => {
      // ignore
    });
  }

  onStop(ctx: BehaviorContext): void {
    try {
      ctx.bot.pvp.stop();
      ctx.bot.pathfinder.stop();
    } catch {
      // ignore
    }
  }
}
