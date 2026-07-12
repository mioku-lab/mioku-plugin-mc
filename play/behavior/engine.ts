import type { Behavior, BehaviorContext } from "./base-behavior";
import type { SurvivalGuard } from "./survival-guard";
import type { BehaviorSpec } from "../types";
import { createBehavior } from "./catalog/factory";

export interface BehaviorEngineOptions {
  ctxBuilder: () => BehaviorContext | null;
  survivalGuard: SurvivalGuard;
  tickInterval: number;
  initial?: BehaviorSpec;
}

export class BehaviorEngine {
  private userBehavior: Behavior | null = null;
  private current: Behavior | null = null;
  private currentKey: string | null = null;
  private timer?: NodeJS.Timeout;
  private readonly ctxBuilder: () => BehaviorContext | null;
  private readonly survivalGuard: SurvivalGuard;
  private readonly tickInterval: number;

  constructor(opts: BehaviorEngineOptions) {
    this.ctxBuilder = opts.ctxBuilder;
    this.survivalGuard = opts.survivalGuard;
    this.tickInterval = opts.tickInterval;
    if (opts.initial) this.userBehavior = createBehavior(opts.initial);
  }

  setUserBehavior(spec: BehaviorSpec): void {
    this.userBehavior = createBehavior(spec);
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), this.tickInterval);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    const ctx = this.ctxBuilder();
    if (this.current && ctx) {
      try {
        this.current.onStop(ctx);
      } catch {
        // ignore
      }
    }
    this.current = null;
    this.currentKey = null;
  }

  currentLabel(): string | null {
    return this.current?.name ?? this.userBehavior?.name ?? null;
  }

  private tick(): void {
    const ctx = this.ctxBuilder();
    if (!ctx) return;
    const survival = this.survivalGuard.check(ctx);
    const target = survival ?? this.userBehavior;
    if (!target) {
      this.maybeStopCurrent(ctx);
      return;
    }
    const key = (survival ? "surv:" : "user:") + target.name;
    if (key !== this.currentKey) {
      this.maybeStopCurrent(ctx);
      this.current = target;
      this.currentKey = key;
      try {
        this.current.onStart(ctx);
      } catch (e) {
        ctx.log(`行为 onStart 失败(${target.name}): ${e}`);
      }
    }
    const cur = this.current;
    if (!cur) return;
    try {
      cur.onTick(ctx);
    } catch (e) {
      ctx.log(`行为 onTick 失败(${target.name}): ${e}`);
    }
    if (cur.isFinished()) {
      this.maybeStopCurrent(ctx);
    }
  }

  private maybeStopCurrent(ctx: BehaviorContext): void {
    if (this.current) {
      try {
        this.current.onStop(ctx);
      } catch (e) {
        ctx.log(`行为 onStop 失败(${this.current.name}): ${e}`);
      }
      this.current = null;
      this.currentKey = null;
    }
  }
}
