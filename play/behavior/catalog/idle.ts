import { Behavior, type BehaviorContext } from "../base-behavior";
import { nearestPlayer, nearestPassiveMob, nearestHostile } from "../../util/entities";

const LOOK_INTERVAL_MS = 500;
const WANDER_INTERVAL_MS = 4_000;
const WANDER_JITTER_MS = 3_000;
const STEP_MS = 800;
const LOOK_IDLE_MS = 1_500;
const DO_NOTHING_MIN_MS = 1_500;
const DO_NOTHING_JITTER_MS = 1_500;
const LOOK_RADIUS = 8;

type Action = "look" | "walk" | "idle";

export class IdleWanderBehavior extends Behavior {
  readonly name = "idle";
  readonly category = "movement" as const;
  private nextWanderAt = 0;
  private nextLookAt = 0;
  private movingUntil = 0;
  private idleUntil = 0;
  private lastAction: Action = "idle";
  private lookTarget: "player" | "passive" | "hostile" | null = null;

  onStart(): void {
    const now = Date.now();
    this.nextWanderAt = now + 1_000;
    this.nextLookAt = now;
    this.movingUntil = 0;
    this.idleUntil = 0;
    this.lastAction = "idle";
    this.lookTarget = null;
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
    if (!this.movingUntil && now >= this.nextLookAt) {
      this.tickLook(ctx);
      this.nextLookAt = now + LOOK_INTERVAL_MS;
    }
    if (this.idleUntil && now < this.idleUntil) return;
    if (now >= this.nextWanderAt) {
      this.tickRandomAction(ctx, now);
    } else if (this.movingUntil > now) {
      this.lastAction = "walk";
    } else {
      this.lastAction = "idle";
    }
  }

  private tickLook(ctx: BehaviorContext): void {
    const target = this.pickLookTarget(ctx);
    try {
      if (target) {
        ctx.bot.lookAt(target.position.offset(0, 1, 0), true);
      } else {
        ctx.bot.look(Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.6, true);
      }
    } catch {
      // ignore
    }
  }

  private pickLookTarget(ctx: BehaviorContext): any | null {
    const player = nearestPlayer(ctx.bot, LOOK_RADIUS);
    if (player) {
      this.lookTarget = "player";
      return player;
    }
    const passive = nearestPassiveMob(ctx.bot, LOOK_RADIUS);
    if (passive) {
      this.lookTarget = "passive";
      return passive;
    }
    const hostile = nearestHostile(ctx.bot, LOOK_RADIUS);
    if (hostile) {
      this.lookTarget = "hostile";
      return hostile;
    }
    this.lookTarget = null;
    return null;
  }

  private tickRandomAction(ctx: BehaviorContext, now: number): void {
    const r = Math.random() * 7;
    if (r < 2) {
      this.lastAction = "look";
      this.idleUntil = now + LOOK_IDLE_MS;
    } else if (r < 4) {
      try {
        ctx.bot.look(Math.random() * Math.PI * 2, 0, true);
        ctx.bot.setControlState("forward", true);
        this.movingUntil = now + STEP_MS;
        this.lastAction = "walk";
      } catch {
        // ignore
      }
    } else {
      this.lastAction = "idle";
      this.idleUntil = now + DO_NOTHING_MIN_MS + Math.random() * DO_NOTHING_JITTER_MS;
    }
    this.nextWanderAt = now + WANDER_INTERVAL_MS + Math.random() * WANDER_JITTER_MS;
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
      lookTarget: this.lookTarget,
      nextWanderInMs: Math.max(0, this.nextWanderAt - now),
      moving: this.movingUntil > now,
    };
  }
}
