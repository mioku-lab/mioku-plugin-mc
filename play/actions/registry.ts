import { z } from "zod";
import type { MissionErrorCode } from "../state/mode";
import type { PlayServerConfig } from "../types";

export interface ActionOutcome {
  action: string;
  status: "succeeded" | "failed";
  code?: MissionErrorCode;
  detail: string;
  data?: unknown;
  at: number;
  directiveId?: string;
  completesDirectiveOnSuccess: boolean;
}

export interface ActionContext {
  bot: any;
  server: PlayServerConfig;
  stopCurrentTask: (reason?: string) => void;
}

interface ActionDefinition {
  name: string;
  description: string;
  paramsSchema: z.ZodTypeAny;
  run(
    ctx: ActionContext,
    params: any,
  ): Promise<{ detail: string; data?: unknown }>;
}

export class ActionRegistry {
  private actions = new Map<string, ActionDefinition>();

  constructor() {
    this.register(defaultDropItemAction);
    this.register(defaultSendCommandAction);
    this.register(defaultStopTaskAction);
  }

  register(action: ActionDefinition): void {
    this.actions.set(action.name, action);
  }

  list(): Array<{ name: string; description: string }> {
    return [...this.actions.values()]
      .map((action) => ({ name: action.name, description: action.description }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async execute(
    name: string,
    params: unknown,
    ctx: ActionContext,
    meta: { directiveId?: string; completesDirectiveOnSuccess?: boolean } = {},
  ): Promise<ActionOutcome> {
    const action = this.actions.get(name);
    if (!action) {
      return failed(name, "unknown", `未知动作: ${name}`, meta);
    }
    const parsed = action.paramsSchema.safeParse(params ?? {});
    if (!parsed.success) {
      return failed(
        name,
        "unknown",
        parsed.error.issues
          .map(
            (issue) => `${issue.path.join(".") || "params"}: ${issue.message}`,
          )
          .join("; "),
        meta,
      );
    }
    try {
      const result = await action.run(ctx, parsed.data);
      return {
        action: name,
        status: "succeeded",
        detail: result.detail,
        data: result.data,
        at: Date.now(),
        directiveId: meta.directiveId,
        completesDirectiveOnSuccess: meta.completesDirectiveOnSuccess ?? true,
      };
    } catch (error) {
      const typed = normalizeActionError(error);
      return failed(name, typed.code, typed.detail, meta);
    }
  }
}

const defaultDropItemAction: ActionDefinition = {
  name: "drop_item",
  description: "丢出指定数量的背包物品，可选先面向附近玩家。",
  paramsSchema: z.object({
    item: z.string().trim().min(1),
    count: z.number().int().min(1).max(64).default(1),
    target: z.string().trim().min(1).optional(),
  }),
  async run(ctx, params) {
    const candidates =
      ctx.bot.inventory
        ?.items?.()
        .filter((item: any) => item.name === params.item) ?? [];
    const available = candidates.reduce(
      (sum: number, item: any) => sum + Number(item.count ?? 0),
      0,
    );
    if (available < params.count) {
      throw actionError(
        "missing_item",
        `物品 ${params.item} 不足，需要 ${params.count}，现有 ${available}`,
      );
    }
    if (params.target) {
      const player = ctx.bot.players?.[params.target]?.entity;
      if (!player?.position)
        throw actionError("target_not_found", `找不到玩家 ${params.target}`);
      await ctx.bot.lookAt(player.position.offset(0, 1, 0), true);
    }
    let remaining = params.count;
    for (const item of candidates) {
      if (remaining <= 0) break;
      const amount = Math.min(remaining, Number(item.count ?? 0));
      await ctx.bot.toss(item.type, item.metadata ?? null, amount);
      remaining -= amount;
    }
    return { detail: `已丢出 ${params.count} 个 ${params.item}`, data: params };
  },
};

const defaultSendCommandAction: ActionDefinition = {
  name: "send_command",
  description: "发送服务器允许列表中的斜杠命令。",
  paramsSchema: z.object({ command: z.string().trim().min(2).max(256) }),
  async run(ctx, params) {
    const command = params.command.startsWith("/")
      ? params.command
      : `/${params.command}`;
    const allowed = ctx.server.allowedCommands.some(
      (entry) => command === entry || command.startsWith(`${entry} `),
    );
    if (!allowed)
      throw actionError("permission_denied", `命令不在允许列表中: ${command}`);
    ctx.bot.chat(command);
    return { detail: `已发送命令 ${command}` };
  },
};

const defaultStopTaskAction: ActionDefinition = {
  name: "stop_current_task",
  description: "停止当前高层任务并回到 idle。",
  paramsSchema: z.object({ reason: z.string().trim().max(256).optional() }),
  async run(ctx, params) {
    ctx.stopCurrentTask(params.reason ?? "work_action_stop");
    return { detail: "已停止当前任务" };
  },
};

function actionError(
  code: MissionErrorCode,
  detail: string,
): Error & { code: MissionErrorCode } {
  return Object.assign(new Error(detail), { code });
}

function normalizeActionError(error: unknown): {
  code: MissionErrorCode;
  detail: string;
} {
  if (error && typeof error === "object" && "code" in error) {
    const typed = error as { code: MissionErrorCode; message?: string };
    return {
      code: typed.code,
      detail: String(typed.message || error),
    };
  }
  return { code: "unknown", detail: String(error) };
}

function failed(
  action: string,
  code: MissionErrorCode,
  detail: string,
  meta: { directiveId?: string; completesDirectiveOnSuccess?: boolean },
): ActionOutcome {
  return {
    action,
    status: "failed",
    code,
    detail,
    at: Date.now(),
    directiveId: meta.directiveId,
    completesDirectiveOnSuccess: meta.completesDirectiveOnSuccess ?? true,
  };
}
