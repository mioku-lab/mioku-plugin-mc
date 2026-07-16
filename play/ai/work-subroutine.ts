import type { AIInstance, AITool, SessionToolDefinition } from "mioku";
import type { PlaySession } from "../session";
import type { PlayEvent } from "../state/event-journal";
import {
  buildWorkSystemPrompt,
  buildWorkUserContext,
} from "./prompt";
import { withTimeoutMs } from "../util/async";
import { logAiRequest, logAiResponse } from "./debug-log";

export type WorkTerminator =
  | { type: "inventory_at_least"; item: string; count: number }
  | { type: "follow_for"; target: string; ms: number }
  | { type: "duration"; ms: number }
  | { type: "manual" };

export interface WorkSubroutineOptions {
  session: PlaySession;
  goal: string;
  terminator: WorkTerminator;
  maxMs?: number;
  maxIterations?: number;
}

export interface WorkSubroutineResult {
  status: "completed" | "timeout" | "failed" | "cancelled";
  summary: string;
  iterations: number;
  elapsedMs: number;
  artifacts: Record<string, unknown>;
}

const WORK_MODEL_TIMEOUT_MS = 60_000;

export class WorkSubroutine {
  private readonly session: PlaySession;
  private readonly goal: string;
  private readonly terminator: WorkTerminator;
  private readonly maxMs: number;
  private readonly maxIterations: number;
  private readonly startedAt: number;
  private status: "running" | "completed" | "timeout" | "failed" | "cancelled" =
    "running";
  private lastSummary = "";
  private lastProgress: { current: number; target: number; unit: string } | undefined;
  private toolCtxBound = false;

  constructor(opts: WorkSubroutineOptions) {
    this.session = opts.session;
    this.goal = opts.goal;
    this.terminator = opts.terminator;
    this.maxMs = opts.maxMs ?? 5 * 60_000;
    this.maxIterations = opts.maxIterations ?? 25;
    this.startedAt = Date.now();
  }

  get options(): { goal: string; terminator: WorkTerminator } {
    return { goal: this.goal, terminator: this.terminator };
  }

  async run(): Promise<WorkSubroutineResult> {
    const work = this.session.getPluginCtx().workInstance;
    if (!work) {
      return {
        status: "failed",
        summary: "work AI 实例不可用",
        iterations: 0,
        elapsedMs: Date.now() - this.startedAt,
        artifacts: {},
      };
    }

    bindWorkToolContext({
      session: this.session,
      onStatusUpdate: (summary, progress) => {
        this.lastSummary = summary;
        this.lastProgress = progress;
        this.session.updateWorkStatus({
          running: true,
          goal: this.goal,
          summary,
          progress,
          updatedAt: Date.now(),
        });
      },
    });
    this.toolCtxBound = true;
    this.session.updateWorkStatus({
      running: true,
      goal: this.goal,
      summary: `开始执行: ${this.goal}`,
      updatedAt: Date.now(),
    });

    const cursor = this.session.events.latestCursor();
    let iterations = 0;

    try {
      while (iterations < this.maxIterations) {
        if (Date.now() - this.startedAt > this.maxMs) {
          this.status = "timeout";
          break;
        }
        if (this.isTerminatorMet()) {
          this.status = "completed";
          break;
        }
        if (this.session.isStopped) {
          this.status = "cancelled";
          break;
        }

        const decision = await this.runOneTurn(work, cursor);
        iterations += 1;
        if (!decision) continue;
        if (decision.fatal) {
          this.status = "failed";
          break;
        }
      }
      if (this.status === "running") {
        this.status =
          Date.now() - this.startedAt > this.maxMs ? "timeout" : "completed";
      }
    } finally {
      if (this.toolCtxBound) {
        clearWorkToolContext();
        this.toolCtxBound = false;
      }
      this.session.updateWorkStatus({
        running: false,
        goal: this.goal,
        summary: this.lastSummary || this.statusDefaultSummary(),
        progress: this.lastProgress,
        updatedAt: Date.now(),
      });
      this.session.events.append("work_completed", {
        goal: this.goal,
        status: this.status,
        iterations,
      });
    }

    return {
      status: this.status,
      summary: this.lastSummary || this.statusDefaultSummary(),
      iterations,
      elapsedMs: Date.now() - this.startedAt,
      artifacts: {
        progress: this.lastProgress,
      },
    };
  }

  private statusDefaultSummary(): string {
    switch (this.status) {
      case "completed":
        return `目标已完成: ${this.goal}`;
      case "timeout":
        return `目标超时: ${this.goal}`;
      case "failed":
        return `目标失败: ${this.goal}`;
      case "cancelled":
        return `目标取消: ${this.goal}`;
      default:
        return `目标进行中: ${this.goal}`;
    }
  }

  private isTerminatorMet(): boolean {
    const bot = this.session.getBot();
    if (!bot) return false;
    switch (this.terminator.type) {
      case "inventory_at_least": {
        const total = countInventoryItem(bot, this.terminator.item);
        return total >= this.terminator.count;
      }
      case "follow_for":
      case "duration":
      case "manual":
        return false;
      default:
        return false;
    }
  }

  private async runOneTurn(
    work: AIInstance,
    cursor: number,
  ): Promise<{ fatal: boolean } | null> {
    const snapshot = this.session.getBehaviorSnapshot();
    if (!snapshot) return null;

    const batch = this.session.events.readAfter(cursor, isWorkEvent, 50);
    const triggerEvents = batch.events.length > 0 ? batch.events : [];

    const context = buildWorkUserContext({
      goal: this.goal,
      terminator: this.terminator,
      triggerEvents,
      snapshot,
      lastActionOutcome: this.session.getLastActionOutcome(),
    });

    const config = this.session.getPluginCtx().getPlayConfig();
    const startedAt = Date.now();
    const messages = [
      { role: "system" as const, content: this.buildWorkSystemPrompt() },
      { role: "user" as const, content: context },
    ];
    logAiRequest(this.session.getPluginCtx().ctx.logger, config, "work", {
      trigger: `iteration:${this.iterationsLabel()}`,
      messages,
      tools: WORK_TOOLS as any[],
      temperature: 0.2,
      max_tokens: 600,
      triggerEvents,
    });

    let response;
    try {
      response = await withTimeoutMs(
        work.complete({
          messages,
          tools: WORK_TOOL_SCHEMAS,
          temperature: 0.2,
          max_tokens: 600,
        }),
        WORK_MODEL_TIMEOUT_MS,
      );
    } catch (error) {
      logAiResponse(this.session.getPluginCtx().ctx.logger, config, "work", {
        durationMs: Date.now() - startedAt,
        error,
      });
      this.session
        .getPluginCtx()
        .ctx.logger.warn(`[MC/play] 工作模型调用失败: ${error}`);
      return null;
    }
    if (!response) {
      return null;
    }
    logAiResponse(this.session.getPluginCtx().ctx.logger, config, "work", {
      durationMs: Date.now() - startedAt,
      content: response.content ?? null,
      reasoning: response.reasoning ?? null,
      toolCalls: response.toolCalls ?? [],
    });

    let toolCalls = response.toolCalls ?? [];
    let content = response.content;
    let lastFatal = false;
    while (toolCalls.length > 0 || (content && content.trim().length > 0)) {
      if (content && content.trim().length > 0) {
        const trimmed = content.trim();
        if (trimmed.length > 0 && !this.lastSummary) {
          this.lastSummary = trimmed;
        }
        content = null;
      }
      if (toolCalls.length === 0) break;
      const call = toolCalls.shift()!;
      const result = await runWorkToolCall(call);
      if (result.fatal) lastFatal = true;
      if (result.outputText) {
        this.lastSummary = result.outputText;
      }
    }

    return { fatal: lastFatal };
  }

  private iterationsLabel(): string {
    return String(Math.floor((Date.now() - this.startedAt) / 1000));
  }

  private buildWorkSystemPrompt(): string {
    const bundles = this.session.describeBundles();
    const actions = this.session.listActions();
    return buildWorkSystemPrompt({
      goal: this.goal,
      terminator: this.terminator,
      bundles,
      actions,
    });
  }
}

interface WorkToolContext {
  session: PlaySession;
  onStatusUpdate: (
    summary: string,
    progress?: { current: number; target: number; unit: string },
  ) => void;
}

let workHandlerCtx: { ctx?: WorkToolContext } = {};

export function bindWorkToolContext(ctx: WorkToolContext): void {
  workHandlerCtx.ctx = ctx;
}

export function clearWorkToolContext(): void {
  workHandlerCtx.ctx = undefined;
}

const WORK_START_MOTION: AITool = {
  name: "start_motion",
  description:
    "Start a behavior bundle. Returns success or rejection reason. Use only ONE bundle at a time — " +
    "starting a new bundle cancels the previous one.",
  parameters: {
    type: "object",
    properties: {
      bundle: { type: "string" },
      params: { type: "object" },
    },
    required: ["bundle"],
  },
  handler: async (args) => {
    const ctx = workHandlerCtx.ctx;
    if (!ctx) return { fatal: true, detail: "work tool context missing" };
    const bundle = String(args?.bundle ?? "").trim();
    const params = (args?.params ?? {}) as Record<string, unknown>;
    if (!bundle) return { fatal: false, detail: "缺少 bundle" };
    const result = ctx.session.startMission({ bundle, params });
    if (result.kind === "applied") {
      return { success: true, missionId: result.missionId, bundleId: result.bundleId };
    }
    return { success: false, rejected: true, reason: result.reason, detail: result.detail };
  },
};

const WORK_STOP_MOTION: AITool = {
  name: "stop_motion",
  description: "Stop the current bundle mission. No-op if nothing is running.",
  parameters: {
    type: "object",
    properties: { reason: { type: "string" } },
  },
  handler: async (args) => {
    const ctx = workHandlerCtx.ctx;
    if (!ctx) return { fatal: true };
    const result = ctx.session.stopMission(
      typeof args?.reason === "string" ? args.reason : "work_stop",
    );
    if (result.kind === "applied") return { success: true, message: result.message };
    return { success: false, reason: result.reason, detail: result.detail };
  },
};

const WORK_PERFORM_ACTION: AITool = {
  name: "perform_action",
  description:
    "Execute an atomic one-shot action (drop_item, send_command, stop_current_task).",
  parameters: {
    type: "object",
    properties: {
      action: { type: "string" },
      params: { type: "object" },
    },
    required: ["action"],
  },
  handler: async (args) => {
    const ctx = workHandlerCtx.ctx;
    if (!ctx) return { fatal: true };
    const action = String(args?.action ?? "").trim();
    const params = (args?.params ?? {}) as Record<string, unknown>;
    if (!action) return { fatal: false, detail: "缺少 action" };
    const outcome = await ctx.session.performAction(action, params);
    return {
      status: outcome.status,
      code: outcome.code,
      detail: outcome.detail,
    };
  },
};

const WORK_UPDATE_STATUS: AITool = {
  name: "update_status",
  description:
    "Update the passive status report that the main agent can read on demand. " +
    "Use sparingly — only when the user-visible progress changed meaningfully.",
  parameters: {
    type: "object",
    properties: {
      summary: {
        type: "string",
        description: "Short status text, e.g. '正在砍第 4 棵树'.",
      },
      progress: {
        type: "object",
        description: "Optional numeric progress {current, target, unit}.",
        properties: {
          current: { type: "number" },
          target: { type: "number" },
          unit: { type: "string" },
        },
      },
    },
    required: ["summary"],
  },
  handler: async (args) => {
    const ctx = workHandlerCtx.ctx;
    if (!ctx) return { fatal: true };
    const summary = String(args?.summary ?? "").trim();
    if (!summary) return { fatal: false, detail: "缺少 summary" };
    const progress = normalizeProgress(args?.progress);
    ctx.onStatusUpdate(summary, progress);
    return { success: true };
  },
};

const WORK_TOOLS: AITool[] = [
  WORK_START_MOTION,
  WORK_STOP_MOTION,
  WORK_PERFORM_ACTION,
  WORK_UPDATE_STATUS,
];

const WORK_TOOL_SCHEMAS = WORK_TOOLS.map((tool) => ({
  type: "function" as const,
  function: {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  },
}));

export function buildWorkSessionTools(): SessionToolDefinition[] {
  return WORK_TOOLS.map((tool) => ({ name: tool.name, tool }));
}

async function runWorkToolCall(call: {
  name: string;
  arguments: string;
  id?: string;
}): Promise<{ fatal: boolean; outputText?: string }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(call.arguments || "{}");
  } catch {
    return { fatal: false };
  }
  const tool = WORK_TOOLS.find((t) => t.name === call.name);
  if (!tool) return { fatal: false };
  try {
    const result = await tool.handler(parsed);
    if (call.name === "update_status" && result && typeof result === "object") {
      const r = result as { summary?: string };
      if (typeof r.summary === "string") return { fatal: false, outputText: r.summary };
    }
    return { fatal: false };
  } catch (error) {
    return { fatal: false };
  }
}

function normalizeProgress(input: unknown):
  | { current: number; target: number; unit: string }
  | undefined {
  if (!input || typeof input !== "object") return undefined;
  const r = input as Record<string, unknown>;
  const current = Number(r.current);
  const target = Number(r.target);
  const unit = typeof r.unit === "string" ? r.unit.trim() : "";
  if (!Number.isFinite(current) || !Number.isFinite(target) || target <= 0 || !unit) {
    return undefined;
  }
  return { current, target, unit };
}

function isWorkEvent(event: PlayEvent): boolean {
  return !["game_chat", "qq_chat", "chat_scan_due"].includes(event.type);
}

function countInventoryItem(bot: any, itemName: string): number {
  let total = 0;
  for (const item of bot.inventory?.items?.() ?? []) {
    const name = String(item.name ?? "").replace(/^minecraft:/, "");
    if (name === itemName || name === `minecraft:${itemName}`) {
      total += Number(item.count ?? 0);
    }
  }
  return total;
}