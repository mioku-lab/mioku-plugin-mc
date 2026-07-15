import type { PlaySession } from "../session";
import type { PlayPluginContext } from "../context";
import type { PlayEvent } from "../state/event-journal";
import {
  buildSessionFacts,
  buildWorkSystemPrompt,
  buildWorkUserContext,
} from "./prompt";
import {
  parseDecisionToolCall,
  WORK_DECISION_TOOL,
  WorkDecisionSchema,
  type WorkDecision,
} from "./protocol";
import { stableStringify } from "./context-builder";
import { withTimeoutMs } from "../util/async";

const WORK_MODEL_TIMEOUT_MS = 120_000;

export interface WorkActivation {
  priority: number;
  bypassCooldown: boolean;
  reason: string;
}

export function getWorkActivation(
  event: PlayEvent,
  state: { directiveActive: boolean; missionActive: boolean },
): WorkActivation | null {
  switch (event.type) {
    case "directive":
      return { priority: 100, bypassCooldown: true, reason: "new_directive" };
    case "death":
    case "respawn":
      return { priority: 100, bypassCooldown: true, reason: event.type };
    case "damage":
      return { priority: 90, bypassCooldown: true, reason: "damage" };
    case "vitals_threshold":
      return {
        priority: 85,
        bypassCooldown: false,
        reason: "vitals_threshold",
      };
    case "day_phase":
      return { priority: 70, bypassCooldown: false, reason: "day_phase" };
    case "mission_outcome": {
      const data = event.data as any;
      if (data?.status === "failed" || data?.status === "blocked") {
        return {
          priority: 85,
          bypassCooldown: false,
          reason: `mission_${data.status}`,
        };
      }
      if (data?.status === "succeeded" && data?.directiveActive) {
        return {
          priority: 65,
          bypassCooldown: false,
          reason: "mission_step_succeeded",
        };
      }
      return null;
    }
    case "action_outcome": {
      const data = event.data as any;
      if (data?.status === "failed") {
        return { priority: 85, bypassCooldown: false, reason: "action_failed" };
      }
      if (data?.status === "succeeded" && data?.directiveActive) {
        return {
          priority: 65,
          bypassCooldown: false,
          reason: "action_step_succeeded",
        };
      }
      return null;
    }
    case "inventory_change":
      return state.directiveActive && !state.missionActive
        ? { priority: 50, bypassCooldown: false, reason: event.type }
        : null;
    case "equipment_change": {
      const data = event.data as any;
      if (data?.critical || data?.missing) {
        return {
          priority: 78,
          bypassCooldown: false,
          reason: "equipment_risk",
        };
      }
      return state.directiveActive && !state.missionActive
        ? { priority: 50, bypassCooldown: false, reason: event.type }
        : null;
    }
    case "path_error":
      return { priority: 80, bypassCooldown: false, reason: "path_error" };
    default:
      return null;
  }
}

export class WorkLoop {
  private readonly session: PlaySession;
  private readonly pluginCtx: PlayPluginContext;
  private readonly systemPrompt: string;
  private readonly sessionFacts: string;
  private cursor = 0;
  private running = false;
  private stopped = false;
  private lastTurnAt = 0;
  private pendingEvents: PlayEvent[] = [];
  private pendingBypass = false;
  private debounceTimer?: NodeJS.Timeout;
  private deferredTimer?: NodeJS.Timeout;
  private unsubscribe?: () => void;
  private recentSignatures = new Map<string, number>();

  constructor(opts: { session: PlaySession; pluginCtx: PlayPluginContext }) {
    this.session = opts.session;
    this.pluginCtx = opts.pluginCtx;
    this.systemPrompt = buildWorkSystemPrompt({
      bundles: opts.session.describeBundles(),
      actions: opts.session.listActions(),
    });
    this.sessionFacts = buildSessionFacts({
      serverName: opts.session.server.name,
      username: opts.session.server.username,
      groupId: opts.session.binding.groupId,
      maxPlayMs: opts.session.server.maxPlayMs,
      allowedCommands: opts.session.server.allowedCommands,
    });
  }

  start(): void {
    this.cursor = this.session.events.latestCursor();
    this.unsubscribe = this.session.events.subscribe((event) =>
      this.onEvent(event),
    );
  }

  stop(): void {
    this.stopped = true;
    this.unsubscribe?.();
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.deferredTimer) clearTimeout(this.deferredTimer);
  }

  private onEvent(event: PlayEvent): void {
    if (this.stopped || this.isDuplicate(event)) return;
    const activation = getWorkActivation(event, {
      directiveActive: this.session.getDirective()?.status === "active",
      missionActive: this.session.getCurrentMission() !== null,
    });
    if (!activation) return;
    this.pendingEvents.push(event);
    this.pendingBypass ||= activation.bypassCooldown;
    if (this.running) return;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    const delay = activation.bypassCooldown
      ? 0
      : this.pluginCtx.getPlayConfig().workEventDebounceMs;
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = undefined;
      this.scheduleTurn();
    }, delay);
  }

  private scheduleTurn(): void {
    if (this.stopped || this.running || this.pendingEvents.length === 0) return;
    const minInterval = this.pendingBypass
      ? 0
      : this.pluginCtx.getPlayConfig().workLoopMinIntervalMs;
    if (this.pendingBypass && this.deferredTimer) {
      clearTimeout(this.deferredTimer);
      this.deferredTimer = undefined;
    }
    const wait = minInterval - (Date.now() - this.lastTurnAt);
    if (wait > 0) {
      if (this.deferredTimer) return;
      this.deferredTimer = setTimeout(() => {
        this.deferredTimer = undefined;
        void this.runTurn();
      }, wait);
      return;
    }
    void this.runTurn();
  }

  private async runTurn(): Promise<void> {
    const work = this.pluginCtx.workInstance;
    const snapshot = this.session.getBehaviorSnapshot();
    if (!work || !snapshot || this.pendingEvents.length === 0) return;
    this.running = true;
    const triggerEvents = [...this.pendingEvents].sort((a, b) => a.seq - b.seq);
    this.pendingEvents = [];
    this.pendingBypass = false;
    const batch = this.session.events.readAfter(this.cursor, isWorkEvent, 50);
    try {
      const context = buildWorkUserContext({
        triggerEvents: batch.events.length > 0 ? batch.events : triggerEvents,
        snapshot,
        directive: this.session.getDirective(),
        lastActionOutcome: this.session.getLastActionOutcome(),
      });
      let response;
      try {
        response = await withTimeoutMs(
          work.complete({
            messages: [
              { role: "system", content: this.systemPrompt },
              { role: "user", content: this.sessionFacts },
              { role: "user", content: context },
            ],
            tools: [WORK_DECISION_TOOL],
            temperature: 0.2,
            max_tokens: 600,
          }),
          WORK_MODEL_TIMEOUT_MS,
        );
      } catch (error) {
        this.pluginCtx.ctx.logger.warn(`[MC/play] 工作模型调用失败: ${error}`);
        return;
      }
      this.cursor = batch.cursor;
      this.lastTurnAt = Date.now();
      const decision = parseDecisionToolCall(
        response.toolCalls,
        "submit_work_decision",
        WorkDecisionSchema,
      );
      if (!decision) {
        this.pluginCtx.ctx.logger.warn(
          "[MC/play] 工作模型未返回有效 submit_work_decision，已安全等待",
        );
        return;
      }
      await this.applyDecision(decision);
    } finally {
      this.running = false;
      if (this.pendingEvents.length > 0 && !this.stopped) this.scheduleTurn();
    }
  }

  private async applyDecision(decision: WorkDecision): Promise<void> {
    const directive = this.session.getDirective();
    const meta = {
      directiveId: directive?.status === "active" ? directive.id : undefined,
      completesDirectiveOnSuccess: decision.completesDirectiveOnSuccess,
    };
    switch (decision.kind) {
      case "start_state": {
        if (!decision.state) return;
        const result = this.session.startMission({
          bundle: decision.state,
          params: decision.params,
          objective: decision.objective,
          ...meta,
        });
        this.session.recordSwitchResult(result);
        if (result.kind === "rejected") {
          this.pluginCtx.ctx.logger.warn(
            `[MC/play] Working AI 选择的状态被拒绝: ${result.reason} - ${result.detail}`,
          );
        }
        return;
      }
      case "perform_action":
        if (decision.action)
          await this.session.performAction(
            decision.action,
            decision.params,
            meta,
          );
        return;
      case "stop":
        this.session.stopMission(decision.reason ?? "working_agent_stop");
        return;
      case "request_main":
        this.session.requestMainAttention(
          decision.reason ?? "Working AI 需要主 AI 处理",
        );
        return;
      case "wait":
        return;
    }
  }

  private isDuplicate(event: PlayEvent): boolean {
    const signature = eventSignature(event);
    const now = Date.now();
    const previous = this.recentSignatures.get(signature) ?? 0;
    this.recentSignatures.set(signature, now);
    for (const [key, at] of this.recentSignatures) {
      if (now - at > 60_000) this.recentSignatures.delete(key);
    }
    const ttl =
      event.type === "mission_outcome" || event.type === "action_outcome"
        ? 30_000
        : 5_000;
    return now - previous < ttl;
  }
}

function isWorkEvent(event: PlayEvent): boolean {
  return !["game_chat", "qq_chat", "main_attention"].includes(event.type);
}

function eventSignature(event: PlayEvent): string {
  const data = event.data as any;
  switch (event.type) {
    case "mission_outcome":
      return `${event.type}:${stableStringify({
        bundleId: data?.bundleId,
        status: data?.status,
        code: data?.code,
        detail: data?.detail,
        directiveId: data?.directiveId,
      })}`;
    case "action_outcome":
      return `${event.type}:${stableStringify({
        action: data?.action,
        status: data?.status,
        code: data?.code,
        detail: data?.detail,
        directiveId: data?.directiveId,
      })}`;
    case "directive":
      return `${event.type}:${String(data?.id ?? event.seq)}`;
    default:
      return `${event.type}:${stableStringify(event.data)}`;
  }
}
