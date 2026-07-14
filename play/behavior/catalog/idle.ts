import { Behavior, type BehaviorContext } from "../base-behavior";

const WANDER_INTERVAL_MS = 15_000;
const WANDER_JITTER_MS = 15_000;
const STEP_MS = 800;

export class IdleWanderBehavior extends Behavior {
  readonly name = "idle";
  readonly category = "movement" as const;
  private nextWanderAt = 0;
  private movingUntil = 0;
  private lastAction: "walk" | "look" | "idle" = "idle";

  onStart(): void {
    this.nextWanderAt = Date.now() + 3_000;
    this.movingUntil = 0;
    this.lastAction = "idle";
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
        this.lastAction = "walk";
      } catch {
        // ignore
      }
      this.nextWanderAt = now + WANDER_INTERVAL_MS + Math.random() * WANDER_JITTER_MS;
    } else if (this.movingUntil > now) {
      this.lastAction = "walk";
    } else {
      this.lastAction = "idle";
    }
  }

  onStop(ctx: BehaviorContext): void {
    try {
      ctx.bot.clearControlStates();
    } catch {
      // ignore
    }
  }

  contributesState(): Record<string, unknown> {
    const now = Date.now();
    return {
      lastAction: this.lastAction,
      nextWanderInMs: Math.max(0, this.nextWanderAt - now),
      moving: this.movingUntil > now,
    };
  }
}
