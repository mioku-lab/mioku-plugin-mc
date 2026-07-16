import type { PlaySession } from "../session";
import type { PlayPluginContext } from "../context";
import type { GameChatLine } from "../bot/play-bus";
import {
  buildMainSystemPrompt,
  buildMainUserContext,
  buildSessionFacts,
} from "./prompt";
import {
  MAIN_TOOLS,
  bindMainToolContext,
  clearMainToolContext,
} from "./main-tools";
import { logAiRequest, logAiResponse } from "./debug-log";
import { withTimeoutMs } from "../util/async";

export interface MainLoopOptions {
  session: PlaySession;
  pluginCtx: PlayPluginContext;
}

const MODEL_TIMEOUT_MS = 30_000;

interface QqChatLine {
  text: string;
  sender?: string;
  atBot?: boolean;
}

type QueueReason = "game_chat" | "qq_chat" | "chat_scan" | "work_completed";

interface QueuedMessage {
  trigger: string;
  reason: QueueReason;
}

export class MainLoop {
  private readonly session: PlaySession;
  private readonly pluginCtx: PlayPluginContext;
  private readonly systemPrompt: string;
  private readonly sessionFacts: string;
  private readonly toolSchemas: any[];
  private cursor = 0;
  private running = false;
  private stopped = false;
  private unsubscribeEvents?: () => void;
  private focusedPlayer: string | null = null;
  private focusedUntil = 0;
  private pendingQueue: QueuedMessage[] = [];
  private lastChatAt = 0;
  private lastChatScanAt = 0;

  constructor(opts: MainLoopOptions) {
    this.session = opts.session;
    this.pluginCtx = opts.pluginCtx;
    const persona = opts.pluginCtx.mainInstance?.getPrompt("persona") ?? "";
    this.systemPrompt = buildMainSystemPrompt({
      persona,
      bundles: opts.session.describeBundles(),
      actions: opts.session.listActions(),
      workStatus: opts.session.getWorkStatus(),
      focusedUntil: 0,
    });
    this.sessionFacts = buildSessionFacts({
      serverName: opts.session.server.name,
      username: opts.session.server.username,
      groupId: opts.session.binding.groupId,
      maxPlayMs: opts.session.server.maxPlayMs,
      allowedCommands: opts.session.server.allowedCommands,
    });
    this.toolSchemas = MAIN_TOOLS.map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    })) as any[];
  }

  start(): void {
    this.cursor = this.session.events.latestCursor();
    this.session.bus.on("chat", (line: GameChatLine) => this.onGameChat(line));
    this.unsubscribeEvents = this.session.events.subscribe((event) => {
      if (event.type === "qq_chat") {
        const data = event.data as QqChatLine | undefined;
        if (this.shouldRespondToQq(data)) {
          this.enqueue({
            trigger: "direct_qq_chat",
            reason: "qq_chat",
          });
        }
        return;
      }
      if (event.type === "chat_scan_due") {
        this.enqueue({ trigger: "chat_scan_due", reason: "chat_scan" });
        return;
      }
      if (event.type === "work_completed") {
        this.enqueue({ trigger: "work_completed", reason: "work_completed" });
        return;
      }
    });
  }

  stop(): void {
    this.stopped = true;
    this.unsubscribeEvents?.();
    clearMainToolContext();
  }

  private onGameChat(line: GameChatLine): void {
    if (!this.shouldRespondToGameChat(line)) return;
    if (line.username) {
      this.focusedPlayer = line.username;
      this.focusedUntil =
        Date.now() + this.pluginCtx.getPlayConfig().mainConversationFocusMs;
    }
    this.enqueue({ trigger: "direct_game_chat", reason: "game_chat" });
  }

  private shouldRespondToGameChat(line: GameChatLine): boolean {
    if (line.kind === "whisper") return true;
    if (line.kind !== "chat" || !line.username) return false;
    if (this.mentionsBot(line.text)) return true;
    return (
      this.focusedPlayer === line.username && Date.now() <= this.focusedUntil
    );
  }

  private shouldRespondToQq(data: QqChatLine | undefined): boolean {
    if (!data?.text) return false;
    if (data.atBot) return true;
    if (this.mentionsBot(data.text)) return true;
    return false;
  }

  private mentionsBot(text: string): boolean {
    const botName = this.session.server.username.toLowerCase();
    const lower = text.toLowerCase();
    return lower.includes(botName) || lower.includes(`@${botName}`);
  }

  private enqueue(msg: QueuedMessage): void {
    if (this.running) {
      this.pendingQueue.push(msg);
      return;
    }
    void this.runTurn(msg);
  }

  private async runTurn(queued: QueuedMessage): Promise<void> {
    if (this.stopped) return;
    this.running = true;
    try {
      await this.runTurnInternal(queued);

      while (this.pendingQueue.length > 0 && !this.stopped) {
        const next = this.pendingQueue.shift()!;
        await this.runTurnInternal(next);
      }
    } finally {
      this.running = false;
    }
  }

  private async runTurnInternal(queued: QueuedMessage): Promise<void> {
    const main = this.pluginCtx.mainInstance;
    const snapshot = this.session.getBehaviorSnapshot();
    if (!main || !snapshot) return;

    const batch = this.session.events.readAfter(this.cursor, isMainEvent, 80);
    this.cursor = batch.cursor;

    let context: string;
    try {
      context = buildMainUserContext({
        trigger: queued.trigger,
        events: batch.events,
        snapshot,
        workStatus: this.session.getWorkStatus(),
        elapsedMs: Date.now() - this.session.startedAt,
        maxMs: this.session.server.maxPlayMs,
      });
    } catch (error) {
      this.pluginCtx.ctx.logger.error(
        `[MC/play] main context 构建失败: ${error}`,
      );
      return;
    }

    const config = this.pluginCtx.getPlayConfig();
    const startedAt = Date.now();
    const messages = [
      { role: "system" as const, content: this.systemPrompt },
      { role: "user" as const, content: this.sessionFacts },
      { role: "user" as const, content: context },
    ];
    bindMainToolContext({
      session: this.session,
      workSubroutineFactory: ({ session, goal, terminator, maxMs, maxIterations }) =>
        this.pluginCtx.createWorkSubroutine({
          session,
          goal,
          terminator,
          maxMs,
          maxIterations,
        }),
    });
    logAiRequest(this.pluginCtx.ctx.logger, config, "main", {
      trigger: queued.trigger,
      messages,
      tools: MAIN_TOOLS as any[],
      temperature: 0.8,
      max_tokens: 700,
      triggerEvents: batch.events,
    });

    let response;
    try {
      response = await withTimeoutMs(
        main.complete({
          messages,
          tools: this.toolSchemas,
          temperature: 0.8,
          max_tokens: 700,
        }),
        MODEL_TIMEOUT_MS,
      );
    } catch (error) {
      logAiResponse(this.pluginCtx.ctx.logger, config, "main", {
        durationMs: Date.now() - startedAt,
        error,
      });
      this.pluginCtx.ctx.logger.warn(`[MC/play] 主模型调用失败: ${error}`);
      return;
    }
    if (!response) {
      this.pluginCtx.ctx.logger.warn(
        "[MC/play] 主模型返回为空，跳过本轮",
      );
      return;
    }
    logAiResponse(this.pluginCtx.ctx.logger, config, "main", {
      durationMs: Date.now() - startedAt,
      content: response.content ?? null,
      reasoning: response.reasoning ?? null,
      toolCalls: response.toolCalls ?? [],
    });

    const content = response.content?.trim() ?? "";
    if (content.length > 0) {
      await this.sendChatLines(splitChatLines(content));
    }
    if (queued.reason === "chat_scan") {
      this.lastChatScanAt = Date.now();
    }
  }

  private async sendChatLines(lines: string[]): Promise<void> {
    const config = this.pluginCtx.getPlayConfig();
    for (const line of lines) {
      const minInterval = config.gameChatMinIntervalMs;
      const wait = minInterval - (Date.now() - this.lastChatAt);
      if (wait > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, wait));
      }
      this.session.say(line);
      this.lastChatAt = Date.now();
    }
  }

  markChatScanDue(now = Date.now()): void {
    if (now - this.lastChatScanAt < this.pluginCtx.getPlayConfig().chatScanIntervalMs) {
      return;
    }
    this.session.events.append("chat_scan_due", { at: now });
    this.lastChatScanAt = now;
  }
}

function isMainEvent(event: { type: string }): boolean {
  return [
    "game_chat",
    "qq_chat",
    "damage",
    "vitals_threshold",
    "day_phase",
    "death",
    "respawn",
    "inventory_change",
    "equipment_change",
    "mission_outcome",
    "action_outcome",
    "path_error",
  ].includes(event.type);
}

function splitChatLines(content: string): string[] {
  return content
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 3)
    .map((line) => line.slice(0, 256));
}