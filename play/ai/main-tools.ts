import type { AITool, SessionToolDefinition } from "mioku";
import type { PlaySession } from "../session";
import type { WorkSubroutine } from "./work-subroutine";

export interface MainToolContext {
  session: PlaySession;
  workSubroutineFactory: (opts: {
    session: PlaySession;
    goal: string;
    terminator: WorkSubroutine["options"]["terminator"];
    maxMs?: number;
    maxIterations?: number;
  }) => WorkSubroutine;
}

const START_MOTION_TOOL: AITool = {
  name: "start_motion",
  description:
    "Start a behavior bundle (a high-level task). The bot's behavior engine will run it autonomously. " +
    "Returns success/missionId if accepted, or rejection reason. Use this when you want the bot to do something multi-step.",
  parameters: {
    type: "object",
    properties: {
      bundle: {
        type: "string",
        description:
          "Bundle id from the available bundles list, e.g. 'task.gather_resource' or 'task.follow_player'.",
      },
      params: {
        type: "object",
        description: "Bundle-specific parameters object.",
      },
    },
    required: ["bundle"],
  },
  handler: async (args, _event) => {
    const ctx: MainToolContext | undefined = (handlerArgs as any).toolCtx;
    if (!ctx) return { error: "tool context missing" };
    const bundle = String(args?.bundle ?? "").trim();
    if (!bundle) return { error: "缺少 bundle" };
    const params = (args?.params ?? {}) as Record<string, unknown>;
    const result = ctx.session.startMission({ bundle, params });
    if (result.kind === "applied") {
      return {
        success: true,
        missionId: result.missionId,
        bundleId: result.bundleId,
        message: result.message,
      };
    }
    return {
      success: false,
      rejected: true,
      reason: result.reason,
      detail: result.detail,
    };
  },
};

const STOP_MOTION_TOOL: AITool = {
  name: "stop_motion",
  description:
    "Stop the currently running mission/bundle. No-op if nothing is running. Use when the current task should be cancelled.",
  parameters: {
    type: "object",
    properties: {
      reason: {
        type: "string",
        description: "Optional reason for stopping (recorded in logs).",
      },
    },
  },
  handler: async (args, _event) => {
    const ctx: MainToolContext | undefined = (handlerArgs as any).toolCtx;
    if (!ctx) return { error: "tool context missing" };
    const result = ctx.session.stopMission(
      typeof args?.reason === "string" ? args.reason : "main_stop",
    );
    if (result.kind === "applied") {
      return { success: true, message: result.message };
    }
    return {
      success: false,
      reason: result.reason,
      detail: result.detail,
    };
  },
};

const PERFORM_ACTION_TOOL: AITool = {
  name: "perform_action",
  description:
    "Execute a one-shot atomic action (drop item, send allowed server command, stop current task). " +
    "Use for immediate actions that don't need multi-step planning.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        description: "Action name: 'drop_item' | 'send_command' | 'stop_current_task'.",
      },
      params: {
        type: "object",
        description: "Action-specific parameters.",
      },
    },
    required: ["action"],
  },
  handler: async (args, _event) => {
    const ctx: MainToolContext | undefined = (handlerArgs as any).toolCtx;
    if (!ctx) return { error: "tool context missing" };
    const action = String(args?.action ?? "").trim();
    if (!action) return { error: "缺少 action" };
    const params = (args?.params ?? {}) as Record<string, unknown>;
    const outcome = await ctx.session.performAction(action, params);
    return {
      status: outcome.status,
      code: outcome.code,
      detail: outcome.detail,
      data: outcome.data,
    };
  },
};

const DELEGATE_WORK_TOOL: AITool = {
  name: "delegate_work",
  description:
    "Delegate a focused sub-task to the work agent. The work agent runs a synchronous sub-loop " +
    "internally (multiple iterations, possibly up to 5 minutes) until the goal is complete, times out, " +
    "or is cancelled. You will receive a final status report. Use this for tasks that need autonomous " +
    "execution over time (e.g. 'gather 16 oak logs', 'follow player X for 2 minutes'). " +
    "Do NOT use this for short actions — call start_motion or perform_action directly instead.",
  parameters: {
    type: "object",
    properties: {
      goal: {
        type: "string",
        description:
          "Short high-level goal, e.g. 'gather 16 oak logs', 'follow kunkun for 2 minutes'.",
      },
      terminator: {
        type: "object",
        description:
          "When to consider the goal complete. One of: " +
          "{type: 'inventory_at_least', item, count}, " +
          "{type: 'follow_for', target, ms}, " +
          "{type: 'duration', ms}, " +
          "{type: 'manual'} (you'll stop it next time).",
        properties: {
          type: {
            type: "string",
            enum: [
              "inventory_at_least",
              "follow_for",
              "duration",
              "manual",
            ],
          },
          item: { type: "string" },
          count: { type: "number" },
          target: { type: "string" },
          ms: { type: "number" },
        },
        required: ["type"],
      },
      maxMs: {
        type: "number",
        description: "Hard timeout in ms. Default: 300000 (5 minutes).",
      },
    },
    required: ["goal", "terminator"],
  },
  handler: async (args, _event) => {
    const ctx: MainToolContext | undefined = (handlerArgs as any).toolCtx;
    if (!ctx) return { error: "tool context missing" };
    const goal = String(args?.goal ?? "").trim();
    const terminator = args?.terminator;
    const maxMs = typeof args?.maxMs === "number" ? args.maxMs : undefined;
    if (!goal) return { error: "缺少 goal" };
    if (!terminator || typeof terminator !== "object") {
      return { error: "缺少 terminator" };
    }
    const sub = ctx.workSubroutineFactory({
      session: ctx.session,
      goal,
      terminator: terminator as any,
      maxMs,
    });
    return await sub.run();
  },
};

const LEAVE_SERVER_TOOL: AITool = {
  name: "leave_server",
  description:
    "Disconnect the bot from the current Minecraft server and end the play session. " +
    "A short goodbye will be sent. Use when the player asks to leave or you decide the session should end.",
  parameters: {
    type: "object",
    properties: {},
  },
  handler: async (_args, _event) => {
    const ctx: MainToolContext | undefined = (handlerArgs as any).toolCtx;
    if (!ctx) return { error: "tool context missing" };
    await ctx.session.stop("main_leave_requested");
    return { success: true, message: "已离开服务器" };
  },
};

export const MAIN_TOOLS: AITool[] = [
  START_MOTION_TOOL,
  STOP_MOTION_TOOL,
  PERFORM_ACTION_TOOL,
  DELEGATE_WORK_TOOL,
  LEAVE_SERVER_TOOL,
];

let handlerArgs: { toolCtx?: MainToolContext } = {};

export function bindMainToolContext(toolCtx: MainToolContext): void {
  handlerArgs.toolCtx = toolCtx;
}

export function clearMainToolContext(): void {
  handlerArgs.toolCtx = undefined;
}

export function buildMainSessionTools(): SessionToolDefinition[] {
  return MAIN_TOOLS.map((tool) => ({ name: tool.name, tool }));
}