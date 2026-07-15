import type { PlaySession } from "../session";
import type { PlayPluginContext } from "../context";
import type { GameChatLine } from "../bot/play-bus";
import {
  buildMainSystemPrompt,
  buildMainUserContext,
  buildSessionFacts,
} from "./prompt";
import {
  MAIN_DECISION_TOOL,
  MainDecisionSchema,
  parseDecisionToolCall,
} from "./protocol";
import { withTimeoutMs } from "../util/async";

export interface MainLoopOptions {
  session: PlaySession;
  pluginCtx: PlayPluginContext;
}

const MODEL_TIMEOUT_MS = 30_000;

export class MainLoop {
  private readonly session: PlaySession;
  private readonly pluginCtx: PlayPluginContext;
  private readonly systemPrompt: string;
  private readonly sessionFacts: string;
  private lastTurnAt = 0;
  private lastChatAt = 0;
  private cursor = 0;
  private running = false;
  private pendingTrigger: string | null = null;
  private deferredTimer?: NodeJS.Timeout;
  private chatDebounceTimer?: NodeJS.Timeout;
  private unsubscribeEvents?: () => void;
  private stopped = false;
  private focusedPlayer: string | null = null;
  private focusedUntil = 0;

  constructor(opts: MainLoopOptions) {
    this.session = opts.session;
    this.pluginCtx = opts.pluginCtx;
    const persona = opts.pluginCtx.mainInstance?.getPrompt("persona") ?? "";
    this.systemPrompt = buildMainSystemPrompt(persona);
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
    this.session.bus.on("chat", (line: GameChatLine) => this.onGameChat(line));
    this.unsubscribeEvents = this.session.events.subscribe((event) => {
      if (event.type === "main_attention")
        this.scheduleTurn("working_agent_attention", true);
    });
  }

  stop(): void {
    this.stopped = true;
    this.unsubscribeEvents?.();
    if (this.deferredTimer) clearTimeout(this.deferredTimer);
    if (this.chatDebounceTimer) clearTimeout(this.chatDebounceTimer);
  }

  private onGameChat(line: GameChatLine): void {
    if (!this.shouldRespondTo(line)) return;
    if (line.username) {
      this.focusedPlayer = line.username;
      this.focusedUntil =
        Date.now() + this.pluginCtx.getPlayConfig().mainConversationFocusMs;
    }
    if (this.chatDebounceTimer) return;
    this.chatDebounceTimer = setTimeout(() => {
      this.chatDebounceTimer = undefined;
      this.scheduleTurn("direct_game_chat");
    }, 1_000);
  }

  private shouldRespondTo(line: GameChatLine): boolean {
    if (line.kind === "whisper") return true;
    if (line.kind !== "chat" || !line.username) return false;
    const botName = this.session.server.username.toLowerCase();
    const text = line.text.toLowerCase();
    if (text.includes(botName) || text.includes(`@${botName}`)) return true;
    return (
      this.focusedPlayer === line.username && Date.now() <= this.focusedUntil
    );
  }

  private scheduleTurn(trigger: string, bypassCooldown = false): void {
    if (this.stopped) return;
    if (this.running) {
      this.pendingTrigger = trigger;
      return;
    }
    if (bypassCooldown && this.deferredTimer) {
      clearTimeout(this.deferredTimer);
      this.deferredTimer = undefined;
    }
    const cooldown = bypassCooldown
      ? 0
      : this.pluginCtx.getPlayConfig().mainLoopMinIntervalMs;
    const wait = cooldown - (Date.now() - this.lastTurnAt);
    if (wait > 0) {
      if (this.deferredTimer) return;
      this.deferredTimer = setTimeout(() => {
        this.deferredTimer = undefined;
        void this.runTurn(trigger);
      }, wait);
      return;
    }
    void this.runTurn(trigger);
  }

  private async runTurn(trigger: string): Promise<void> {
    this.running = true;
    try {
      const main = this.pluginCtx.mainInstance;
      const snapshot = this.session.getBehaviorSnapshot();
      if (!main || !snapshot) return;
      const batch = this.session.events.readAfter(
        this.cursor,
        (event) =>
          [
            "game_chat",
            "qq_chat",
            "mission_outcome",
            "action_outcome",
            "main_attention",
          ].includes(event.type),
        80,
      );
      const dynamicContext = buildMainUserContext({
        trigger,
        events: batch.events,
        snapshot,
        directive: this.session.getDirective(),
        elapsedMs: Date.now() - this.session.startedAt,
        maxMs: this.session.server.maxPlayMs,
      });
      let response;
      try {
        response = await withTimeoutMs(
          main.complete({
            messages: [
              { role: "system", content: this.systemPrompt },
              { role: "user", content: this.sessionFacts },
              { role: "user", content: dynamicContext },
            ],
            tools: [MAIN_DECISION_TOOL],
            temperature: 0.8,
            max_tokens: 700,
          }),
          MODEL_TIMEOUT_MS,
        );
      } catch (error) {
        this.pluginCtx.ctx.logger.warn(`[MC/play] 主模型调用失败: ${error}`);
        return;
      }
      this.cursor = batch.cursor;
      this.lastTurnAt = Date.now();
      const decision = parseDecisionToolCall(
        response.toolCalls,
        "submit_main_decision",
        MainDecisionSchema,
      );
      if (!decision) {
        this.pluginCtx.ctx.logger.warn(
          "[MC/play] 主模型未返回有效 submit_main_decision，已安全忽略",
        );
        return;
      }
      for (const line of decision.gameMessages) await this.throttledChat(line);
      if (decision.directive?.goal) {
        this.session.setDirective(
          decision.directive.goal,
          decision.directive.replace ?? true,
        );
      }
      if (decision.leave)
        await this.session.stop("main_decision_leave", { skipGoodbye: true });
    } finally {
      this.running = false;
      if (this.pendingTrigger && !this.stopped) {
        const next = this.pendingTrigger;
        this.pendingTrigger = null;
        this.scheduleTurn(next);
      }
    }
  }

  private async throttledChat(line: string): Promise<void> {
    const minInterval = this.pluginCtx.getPlayConfig().gameChatMinIntervalMs;
    const wait = minInterval - (Date.now() - this.lastChatAt);
    if (wait > 0)
      await new Promise<void>((resolve) => setTimeout(resolve, wait));
    this.session.say(line);
    this.lastChatAt = Date.now();
  }
}
