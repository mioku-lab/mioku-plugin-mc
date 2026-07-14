import { randomUUID } from "node:crypto";
import type { BehaviorEngine } from "../behavior/engine";
import type { MemoryBus } from "../state/memory-bus";
import type { ModeState, MissionState } from "../state/mode";
import type { TaskRegistry, BehaviorBundle } from "./registry";

export type BundleId = string;
export type MissionId = string;

export type SwitchResult =
  | {
      kind: "applied";
      missionId: MissionId;
      bundleId: BundleId;
      effectiveAt: number;
      message: string;
    }
  | {
      kind: "rejected";
      reason:
        | "unknown_bundle"
        | "invalid_params"
        | "no_bot_session"
        | "engine_busy"
        | "rejected_by_engine";
      detail: string;
    };

export interface MissionSpec {
  bundle: BundleId;
  params?: Record<string, unknown>;
}

export interface MissionControllerOptions {
  registry: TaskRegistry;
  engine: BehaviorEngine;
  bus: MemoryBus;
  buildContext: () => any;
  log?: (msg: string) => void;
}

const EMPTY_LAST_SWITCH = {
  from: null,
  to: "IDLE" as const,
  reason: "init",
  at: 0,
};

export class MissionController {
  private current: MissionState | null = null;
  private modeState: ModeState = {
    current: "IDLE",
    mission: null,
    lastSwitch: { ...EMPTY_LAST_SWITCH, at: Date.now() },
  };

  constructor(private readonly opts: MissionControllerOptions) {}

  getModeState(): ModeState {
    return this.modeState;
  }

  getCurrentMission(): MissionState | null {
    return this.current;
  }

  startMission(spec: MissionSpec): SwitchResult {
    const validation = this.opts.registry.validate(spec.bundle, spec.params);
    if (!validation.ok) {
      const reason = validation.error.startsWith("unknown_bundle")
        ? "unknown_bundle"
        : "invalid_params";
      return { kind: "rejected", reason, detail: validation.error };
    }

    const bundle = this.opts.registry.get(spec.bundle);
    if (!bundle) {
      return {
        kind: "rejected",
        reason: "unknown_bundle",
        detail: `bundle not found: ${spec.bundle}`,
      };
    }

    const ctx = this.opts.buildContext();
    if (!ctx?.bot) {
      return {
        kind: "rejected",
        reason: "no_bot_session",
        detail: "bot 尚未连接或上下文不可用",
      };
    }

    const params = validation.params as Record<string, unknown>;
    const built = safeBuild(bundle, params, ctx, this.opts.log);
    if (!built.ok) {
      return { kind: "rejected", reason: "rejected_by_engine", detail: built.error };
    }

    const missionId = randomUUID();
    const startedAt = Date.now();
    const previous = this.current;

    if (previous) {
      this.opts.engine.removeMissionBehaviors(previous.missionId);
    }

    const behaviors = built.entries.map((e) => e.behavior);
    this.opts.engine.setMissionBehaviors(missionId, behaviors);

    this.current = {
      missionId,
      bundleId: bundle.id,
      params,
      startedAt,
      progress: bundle.snapshot ? bundle.snapshot(params) : null,
    };

    this.updateBus();
    this.recordModeSwitch(bundle.mode ?? "MISSION", `mission:${bundle.id}`);

    this.opts.log?.(
      `[MC/play] 任务启动: ${bundle.id} (${missionId.slice(0, 8)})`,
    );

    return {
      kind: "applied",
      missionId,
      bundleId: bundle.id,
      effectiveAt: startedAt,
      message: `已启动 ${bundle.id}`,
    };
  }

  stopMission(reason = "manual_stop"): SwitchResult {
    if (!this.current) {
      return {
        kind: "rejected",
        reason: "rejected_by_engine",
        detail: "没有进行中的任务",
      };
    }
    const previous = this.current;
    this.opts.engine.removeMissionBehaviors(previous.missionId);
    this.current = null;
    this.updateBus();
    this.recordModeSwitch("IDLE", reason);
    this.opts.log?.(
      `[MC/play] 任务停止: ${previous.bundleId} (${reason})`,
    );
    return {
      kind: "applied",
      missionId: previous.missionId,
      bundleId: previous.bundleId,
      effectiveAt: Date.now(),
      message: `已停止 ${previous.bundleId}`,
    };
  }

  private updateBus(): void {
    this.opts.bus.set("mission", this.current, { ttlMs: 0 });
  }

  private recordModeSwitch(to: ModeState["current"], reason: string): void {
    const from = this.modeState.current;
    if (from === to && this.current?.bundleId === this.modeState.mission?.bundleId) {
      return;
    }
    this.modeState = {
      current: to,
      mission: this.current,
      lastSwitch: { from, to, reason, at: Date.now() },
    };
  }
}

function safeBuild(
  bundle: BehaviorBundle,
  params: unknown,
  ctx: any,
  log?: (msg: string) => void,
): { ok: true; entries: ReturnType<BehaviorBundle["build"]> } | { ok: false; error: string } {
  try {
    const entries = (bundle.build as any)(params, ctx);
    return { ok: true, entries };
  } catch (err) {
    log?.(`[MC/play] bundle.build 失败 (${bundle.id}): ${err}`);
    return { ok: false, error: String(err) };
  }
}
