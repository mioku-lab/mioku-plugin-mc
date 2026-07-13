import type { Behavior, BehaviorContext } from "./base-behavior";
import type { BehaviorSpec } from "../types";
import { createBehavior } from "./catalog/factory";

export interface BehaviorEngineOptions {
  ctxBuilder: () => BehaviorContext | null;
  tickInterval: number;
  survival: Behavior[];
  overlays: Behavior[];
  initialMovement?: BehaviorSpec;
}

export interface BehaviorStateInfo {
  name: string;
  category: string;
  priority: number;
  enabled: boolean;
  active: boolean;
}

export class BehaviorEngine {
  private readonly survival: Behavior[];
  private readonly overlays: Behavior[];
  private movement: Behavior | null = null;
  private current: Behavior | null = null;
  private timer?: NodeJS.Timeout;
  private readonly ctxBuilder: () => BehaviorContext | null;
  private readonly tickInterval: number;

  constructor(opts: BehaviorEngineOptions) {
    this.ctxBuilder = opts.ctxBuilder;
    this.tickInterval = opts.tickInterval;
    this.survival = opts.survival;
    this.overlays = opts.overlays;
    if (opts.initialMovement) {
      this.movement = createBehavior(opts.initialMovement);
    }
  }

  setMovement(spec: BehaviorSpec): void {
    this.movement = createBehavior(spec);
  }

  stopMovement(): void {
    this.movement = createBehavior({ behavior: "idle", params: {} });
  }

  toggleOverlay(name: string, enabled: boolean, params?: Record<string, string>): boolean {
    const b = this.overlays.find((o) => o.name === name);
    if (!b) return false;
    if (params) b.configure(params);
    b.enabled = enabled;
    return true;
  }

  isOverlayEnabled(name: string): boolean {
    const b = this.overlays.find((o) => o.name === name);
    return b?.enabled ?? false;
  }

  clear(): void {
    for (const o of this.overlays) o.enabled = false;
    this.movement = createBehavior({ behavior: "idle", params: {} });
  }

  currentLabel(): string | null {
    return this.current?.name ?? null;
  }

  getStates(ctx: BehaviorContext): BehaviorStateInfo[] {
    const all = [
      ...this.survival,
      ...this.overlays,
      ...(this.movement ? [this.movement] : []),
    ];
    return all.map((b) => ({
      name: b.name,
      category: b.category,
      priority: b.priority,
      enabled: b.effectivelyEnabled,
      active: b.effectivelyEnabled && this.safeActive(b, ctx),
    }));
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
  }

  private tick(): void {
    const ctx = this.ctxBuilder();
    if (!ctx) return;

    const candidates: Behavior[] = [];
    for (const b of this.survival) candidates.push(b);
    for (const b of this.overlays) candidates.push(b);
    if (this.movement) candidates.push(this.movement);

    let winner: Behavior | null = null;
    for (const b of candidates) {
      if (!b.effectivelyEnabled) continue;
      if (!this.safeActive(b, ctx)) continue;
      if (!winner || b.priority > winner.priority) winner = b;
    }

    if (this.current !== winner) {
      if (this.current) {
        try {
          this.current.onStop(ctx);
        } catch (e) {
          ctx.log(`行为 onStop 失败(${this.current.name}): ${e}`);
        }
      }
      this.current = winner;
      if (this.current) {
        try {
          this.current.onStart(ctx);
        } catch (e) {
          ctx.log(`行为 onStart 失败(${this.current.name}): ${e}`);
        }
      }
    }

    if (this.current) {
      try {
        this.current.onTick(ctx);
      } catch (e) {
        ctx.log(`行为 onTick 失败(${this.current.name}): ${e}`);
      }
      if (this.current.isFinished()) {
        try {
          this.current.onStop(ctx);
        } catch {
          // ignore
        }
        this.current = null;
      }
    }
  }

  private safeActive(b: Behavior, ctx: BehaviorContext): boolean {
    try {
      return b.isActive(ctx);
    } catch {
      return false;
    }
  }
}
