import { Behavior, type BehaviorContext } from "../base-behavior";

const WANDER_INTERVAL_MS = 15_000;
const WANDER_JITTER_MS = 15_000;
const STEP_MS = 800;

export class IdleWanderBehavior extends Behavior {
  readonly name = "idle";
  readonly category = "movement" as const;
  private nextWanderAt = 0;
  private movingUntil = 0;

  onStart(): void {
    this.nextWanderAt = Date.now() + 3_000;
    this.movingUntil = 0;
  }

  onTick(ctx: BehaviorContext): void {
    const now = Date.now();
    if (this.movingUntil && now >= this.movingUntil) {
      try {
        ctx.bot.clearControlStates();
      } catch {
        // ignore
      }
      this.movingUntil = 0;
    }
    if (now >= this.nextWanderAt) {
      try {
        ctx.bot.look(Math.random() * Math.PI * 2, 0, true);
        ctx.bot.setControlState("forward", true);
        this.movingUntil = now + STEP_MS;
      } catch {
        // ignore
      }
      this.nextWanderAt = now + WANDER_INTERVAL_MS + Math.random() * WANDER_JITTER_MS;
    }
  }

  onStop(ctx: BehaviorContext): void {
    try {
      ctx.bot.clearControlStates();
    } catch {
      // ignore
    }
  }
}
