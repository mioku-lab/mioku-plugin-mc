import { Behavior, type BehaviorContext } from "../base-behavior";
import { goals } from "mineflayer-pathfinder";
import { entityDistance } from "../../util/entities";

const RETARGET_MS = 2_000;
const EMOTE_INTERVAL_MS = 8_000;
const APPROACH_DISTANCE = 2;

export class SocializeBehavior extends Behavior {
  readonly name = "socialize";
  private retargetAt = 0;
  private emoteAt = 0;

  onTick(ctx: BehaviorContext): void {
    const bot = ctx.bot;
    const players = Object.values(bot.players).filter(
      (p: any) => p?.entity && p.username !== bot.username,
    ) as any[];
    if (players.length === 0) return;

    players.sort(
      (a, b) => entityDistance(bot.entity, a.entity) - entityDistance(bot.entity, b.entity),
    );
    const nearest = players[0];
    const dist = entityDistance(bot.entity, nearest.entity);

    if (dist > APPROACH_DISTANCE) {
      const now = Date.now();
      if (now >= this.retargetAt && !bot.pathfinder.isMoving()) {
        this.retargetAt = now + RETARGET_MS;
        bot.pathfinder
          .goto(new goals.GoalFollow(nearest.entity, APPROACH_DISTANCE))
          .catch(() => {
            // ignore
          });
      }
      return;
    }

    const now = Date.now();
    if (now >= this.emoteAt) {
      this.emoteAt = now + EMOTE_INTERVAL_MS;
      try {
        bot.swingArm("right");
      } catch {
        // ignore
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
