import { randomUUID } from "node:crypto";
import type { BehaviorMissionReporter } from "../behavior/base-behavior";
import type { BehaviorEngine } from "../behavior/engine";
import type { MemoryBus } from "../state/memory-bus";
import type {
  MissionErrorCode,
  MissionOutcome,
  MissionState,
  ModeState,
} from "../state/mode";
import type { BehaviorBundle, TaskRegistry } from "./registry";

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
  objective?: string;
  directiveId?: string;
  completesDirectiveOnSuccess?: boolean;
}

export interface MissionControllerOptions {
  registry: TaskRegistry;
  engine: BehaviorEngine;
  bus: MemoryBus;
  buildContext: () => any;
  log?: (msg: string) => void;
  onOutcome?: (outcome: MissionOutcome) => void;
}

const EMPTY_LAST_SWITCH = {
  from: null,
  to: "IDLE" as const,
  reason: "init",
  at: 0,
};

export class MissionController {
  private current: MissionState | null = null;
  private currentBundle: BehaviorBundle | null = null;
  private lastOutcome: MissionOutcome | null = null;
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
    return this.current ? { ...this.current } : null;
  }

  getLastOutcome(): MissionOutcome | null {
    return this.lastOutcome ? { ...this.lastOutcome } : null;
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

    const missionId = randomUUID();
    const startedAt = Date.now();
    const params = validation.params as Record<string, unknown>;
    const state: MissionState = {
      missionId,
      bundleId: bundle.id,
      params,
      startedAt,
      status: "running",
      progress: bundle.snapshot ? bundle.snapshot(params) : params,
      objective: spec.objective,
      directiveId: spec.directiveId,
      completesDirectiveOnSuccess: spec.completesDirectiveOnSuccess ?? true,
    };
    const reporter = this.createReporter(missionId);
    const built = safeBuild(
      bundle,
      state.params,
      { ...ctx, bus: this.opts.bus, mission: reporter },
      this.opts.log,
    );
    if (!built.ok) {
      return {
        kind: "rejected",
        reason: "rejected_by_engine",
        detail: built.error,
      };
    }

    if (this.current)
      this.finish(
        this.current.missionId,
        "cancelled",
        "cancelled",
        "任务被新任务替换",
      );
    for (const entry of built.entries) entry.behavior.bindMission(reporter);
    this.current = state;
    this.currentBundle = bundle;
    this.opts.engine.setMissionBehaviors(
      missionId,
      built.entries.map((entry) => entry.behavior),
    );
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

  tick(): void {
    const current = this.current;
    const bundle = this.currentBundle;
    if (!current || !bundle?.isFinished) return;
    const ctx = this.opts.buildContext();
    if (!ctx?.bot) return;
    try {
      if (
        bundle.isFinished({
          ...ctx,
          bus: this.opts.bus,
          mission: this.createReporter(current.missionId),
          startedAt: current.startedAt,
          internal: current.progress,
        })
      ) {
        this.finish(current.missionId, "succeeded", undefined, "任务完成");
      }
    } catch (error) {
      this.opts.log?.(
        `[MC/play] mission.isFinished 失败 (${bundle.id}): ${error}`,
      );
    }
  }

  stopMission(reason = "manual_stop"): SwitchResult {
    const current = this.current;
    if (!current) {
      return {
        kind: "rejected",
        reason: "rejected_by_engine",
        detail: "没有进行中的任务",
      };
    }
    this.finish(current.missionId, "cancelled", "cancelled", reason);
    return {
      kind: "applied",
      missionId: current.missionId,
      bundleId: current.bundleId,
      effectiveAt: Date.now(),
      message: `已停止 ${current.bundleId}`,
    };
  }

  private createReporter(missionId: string): BehaviorMissionReporter {
    return {
      progress: (value) => {
        if (this.current?.missionId !== missionId) return;
        this.current.progress = value;
        this.updateBus();
      },
      succeed: (detail, progress) =>
        this.finish(missionId, "succeeded", undefined, detail, progress),
      fail: (code, detail, progress) =>
        this.finish(missionId, "failed", code, detail, progress),
      block: (code, detail, progress) =>
        this.finish(missionId, "blocked", code, detail, progress),
      isCurrent: () => this.current?.missionId === missionId,
    };
  }

  private finish(
    missionId: string,
    status: MissionOutcome["status"],
    code?: MissionErrorCode,
    detail?: string,
    progress?: unknown,
  ): void {
    const current = this.current;
    if (!current || current.missionId !== missionId) return;
    this.opts.engine.removeMissionBehaviors(missionId);
    const outcome: MissionOutcome = {
      missionId,
      bundleId: current.bundleId,
      status,
      code,
      detail,
      progress: progress ?? current.progress,
      startedAt: current.startedAt,
      endedAt: Date.now(),
      directiveId: current.directiveId,
      completesDirectiveOnSuccess: current.completesDirectiveOnSuccess,
    };
    this.current = null;
    this.currentBundle = null;
    this.lastOutcome = outcome;
    this.updateBus();
    this.recordModeSwitch("IDLE", `mission_${status}`);
    this.opts.log?.(
      `[MC/play] 任务结束: ${outcome.bundleId} status=${status}${code ? ` code=${code}` : ""}`,
    );
    this.opts.onOutcome?.(outcome);
  }

  private updateBus(): void {
    this.opts.bus.set("mission", this.current, { ttlMs: 0 });
  }

  private recordModeSwitch(to: ModeState["current"], reason: string): void {
    const from = this.modeState.current;
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
):
  | { ok: true; entries: ReturnType<BehaviorBundle["build"]> }
  | { ok: false; error: string } {
  try {
    return { ok: true, entries: (bundle.build as any)(params, ctx) };
  } catch (error) {
    log?.(`[MC/play] bundle.build 失败 (${bundle.id}): ${error}`);
    return { ok: false, error: String(error) };
  }
}
