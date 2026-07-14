import type { Behavior, BehaviorContext } from "./base-behavior";
import type { MovementInit } from "../types";
import { createBehavior } from "./catalog/factory";
import type { BehaviorMode, ModeState } from "../state/mode";

export interface BehaviorEngineOptions {
  ctxBuilder: () => BehaviorContext | null;
  tickInterval: number;
  survival: Behavior[];
  overlays: Behavior[];
  initialMovement?: MovementInit;
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
  private missionId: string | null = null;
  private missionBehaviors: Behavior[] = [];
  private timer?: NodeJS.Timeout;
  private current: Behavior | null = null;
  private lastMode: BehaviorMode = "IDLE";
  private readonly lastSwitch: ModeState["lastSwitch"] = {
    from: null,
    to: "IDLE",
    reason: "init",
    at: Date.now(),
  };
  private readonly ctxBuilder: () => BehaviorContext | null;
  private readonly tickInterval: number;

  constructor(opts: BehaviorEngineOptions) {
    this.ctxBuilder = opts.ctxBuilder;
    this.tickInterval = opts.tickInterval;
    this.survival = opts.survival;
    this.overlays = opts.overlays;
    if (opts.initialMovement) {
      this.movement = createBehavior(opts.initialMovement);
      this.movement.enabled = true;
    }
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

  setMissionBehaviors(missionId: string, behaviors: Behavior[]): void {
    this.missionId = missionId;
    for (const b of behaviors) b.enabled = true;
    this.missionBehaviors = behaviors;
  }

  removeMissionBehaviors(missionId: string): void {
    if (this.missionId === missionId) {
      this.missionBehaviors = [];
      this.missionId = null;
    }
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
    this.movement = createBehavior({ name: "idle", params: {} });
    this.movement.enabled = true;
    this.missionBehaviors = [];
    this.missionId = null;
  }

  stopMission(): void {
    this.movement = createBehavior({ name: "idle", params: {} });
    this.movement.enabled = true;
    this.missionBehaviors = [];
    this.missionId = null;
  }

  currentLabel(): string | null {
    return this.current?.name ?? null;
  }

  getStates(ctx: BehaviorContext): BehaviorStateInfo[] {
    const all = this.getAllBehaviors();
    return all.map((b) => ({
      name: b.name,
      category: b.category,
      priority: b.priority,
      enabled: b.effectivelyEnabled,
      active: b.effectivelyEnabled && this.safeActive(b, ctx),
    }));
  }

  getAllBehaviors(): Behavior[] {
    const list: Behavior[] = [];
    list.push(...this.survival);
    list.push(...this.overlays);
    for (const b of this.missionBehaviors) list.push(b);
    if (this.movement) list.push(this.movement);
    return list;
  }

  modeState(): ModeState {
    const next = this.computeMode();
    if (next !== this.lastMode) {
      this.lastSwitch.from = this.lastMode;
      this.lastSwitch.to = next;
      this.lastSwitch.reason = next === "EMERGENCY" ? "emergency_engaged" : "emergency_cleared";
      this.lastSwitch.at = Date.now();
      this.lastMode = next;
    }
    return {
      current: this.lastMode,
      mission: null,
      lastSwitch: { ...this.lastSwitch },
    };
  }

  private tick(): void {
    const ctx = this.ctxBuilder();
    if (!ctx) return;

    const candidates: Behavior[] = [];
    for (const b of this.survival) candidates.push(b);
    for (const b of this.overlays) candidates.push(b);
    for (const b of this.missionBehaviors) candidates.push(b);
    if (!this.missionHasActive(ctx) && this.movement) candidates.push(this.movement);

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

  private missionHasActive(ctx: BehaviorContext): boolean {
    for (const b of this.missionBehaviors) {
      if (!b.effectivelyEnabled) continue;
      if (this.safeActive(b, ctx)) return true;
    }
    return false;
  }

  private computeMode(): BehaviorMode {
    const ctx = this.ctxBuilder();
    if (!ctx) return this.lastMode;
    const all = [...this.survival, ...this.overlays, ...this.missionBehaviors];
    if (!this.missionHasActive(ctx) && this.movement) all.push(this.movement);
    let emergency = false;
    let mission = false;
    for (const b of all) {
      if (!b.effectivelyEnabled) continue;
      if (!this.safeActive(b, ctx)) continue;
      if (b.category === "survival") {
        emergency = true;
        break;
      }
      if (b.category === "movement" || b.category === "combat") {
        mission = true;
      }
    }
    if (emergency) return "EMERGENCY";
    if (mission) return "MISSION";
    return "IDLE";
  }
}
