import type { PlaySession } from "../session";
import type { PlayPluginContext } from "../context";
import type { GameChatLine } from "../bot/play-bus";
import { buildMainPrompt } from "./prompt";
import { parseMainOutput } from "./output-parser";
import { withTimeoutMs } from "../util/async";

export interface MainLoopOptions {
  session: PlaySession;
  pluginCtx: PlayPluginContext;
  onAction?: (action: string) => void;
  getBehaviorLabel?: () => string | null;
}

const CHAT_DEBOUNCE_MS = 5_000;
const MAX_CHAT_LINES_PER_TURN = 3;
const MODEL_TIMEOUT_MS = 30_000;

export class MainLoop {
  private readonly session: PlaySession;
  private readonly pluginCtx: PlayPluginContext;
  onAction?: (action: string) => void;
  getBehaviorLabel?: () => string | null;
  private lastAction: string | null = null;
  private lastAssistantOutput: string | null = null;
  private lastTurnAt = 0;
  private lastChatAt = 0;
  private running = false;
  private pendingTrigger: string | null = null;
  private deferredTimer?: NodeJS.Timeout;
  private idleTimer?: NodeJS.Timeout;
  private chatDebounceTimer?: NodeJS.Timeout;
  private stopped = false;

  constructor(opts: MainLoopOptions) {
    this.session = opts.session;
    this.pluginCtx = opts.pluginCtx;
    this.onAction = opts.onAction;
    this.getBehaviorLabel = opts.getBehaviorLabel;
  }

  start(): void {
    const bus = this.session.bus;
    bus.on("chat", (line: GameChatLine) => this.onGameChat(line));
    bus.on("health", () => this.onHealth());
    bus.on("death", () => this.scheduleTurn("respawn"));
    bus.on("playerJoined", () => this.scheduleTurn("player_near"));
    this.idleTimer = setInterval(
      () => this.scheduleTurn("idle_timer"),
      this.pluginCtx.config.mainLoopIdleIntervalMs,
    );
  }

  stop(): void {
    this.stopped = true;
    if (this.idleTimer) clearInterval(this.idleTimer);
    if (this.deferredTimer) clearTimeout(this.deferredTimer);
    if (this.chatDebounceTimer) clearTimeout(this.chatDebounceTimer);
  }

  private onGameChat(line: GameChatLine): void {
    if (this.chatDebounceTimer) {
      // already batching; the buffer is consumed when the timer fires
      return;
    }
    void line;
    this.chatDebounceTimer = setTimeout(() => {
      this.chatDebounceTimer = undefined;
      this.scheduleTurn("game_chat");
    }, CHAT_DEBOUNCE_MS);
  }

  private onHealth(): void {
    const bot = this.session.controller.bot;
    if (bot && (bot.health <= 6 || bot.food <= 6)) {
      this.scheduleTurn("low_health");
    }
  }

  private scheduleTurn(trigger: string): void {
    if (this.stopped) return;
    if (this.running) {
      this.pendingTrigger = trigger;
      return;
    }
    const cooldown = this.pluginCtx.config.mainLoopMinIntervalMs;
    const elapsed = Date.now() - this.lastTurnAt;
    if (elapsed < cooldown) {
      if (this.deferredTimer) return;
      this.deferredTimer = setTimeout(() => {
        this.deferredTimer = undefined;
        void this.runTurn(trigger);
      }, cooldown - elapsed);
      return;
    }
    void this.runTurn(trigger);
  }

  private async runTurn(trigger: string): Promise<void> {
    this.running = true;
    try {
      const main = this.pluginCtx.mainInstance;
      const config = this.pluginCtx.getPlayConfig();
      if (!main || !this.session.controller.bot) return;

      const snapshot = this.session.getBehaviorSnapshot();
      if (!snapshot) return;
      const elapsedMs = Date.now() - this.session.startedAt;
      const maxMs = this.session.server.maxPlayMs;
      const persona = main.getPrompt("persona") ?? "";
      const budgetWarn = elapsedMs >= maxMs * config.maxPlayBudgetWarnRatio;

      const prompt = buildMainPrompt({
        persona,
        serverName: this.session.server.name,
        username: this.session.server.username,
        groupId: this.session.binding.groupId,
        gameLines: this.formatGameLines(),
        qqLines: this.session.history.getQqLines(),
        snapshot,
        trigger,
        budgetWarn,
        elapsedMs,
        maxMs,
      });

      const messages: any[] = [];
      if (this.lastAssistantOutput) {
        messages.push({ role: "assistant", content: this.lastAssistantOutput });
      }
      const lastResult = this.session.consumeLastSwitchResult();
      if (lastResult) {
        messages.push({
          role: "user",
          content: this.formatSwitchFeedback(lastResult),
        });
      }
      messages.push({
        role: "user",
        content: `Your turn. React per the format rules. Trigger: ${trigger}.`,
      });

      let output = "";
      try {
        output = await withTimeoutMs(
          main.generateText({
            prompt,
            messages,
            temperature: 0.8,
          }),
          MODEL_TIMEOUT_MS,
        );
      } catch (err) {
        this.pluginCtx.ctx.logger.warn(`[MC/play] 主模型调用失败: ${err}`);
        return;
      }

      this.lastTurnAt = Date.now();
      this.lastAssistantOutput = output || null;
      await this.dispatch(output);
    } finally {
      this.running = false;
      if (this.pendingTrigger && !this.stopped) {
        const next = this.pendingTrigger;
        this.pendingTrigger = null;
        this.scheduleTurn(next);
      }
    }
  }

  private async dispatch(text: string): Promise<void> {
    const parsed = parseMainOutput(text);

    for (const line of parsed.chatLines.slice(0, MAX_CHAT_LINES_PER_TURN)) {
      await this.throttledChat(line);
    }
    if (parsed.qqMessages.length > 0) {
      await this.session.sendQq(parsed.qqMessages[0]);
    }
    for (const action of parsed.actions) {
      this.lastAction = action;
      this.onAction?.(action);
    }
    if (parsed.exit) {
      await this.session.stop("exit_marker");
    }
  }

  private async throttledChat(line: string): Promise<void> {
    const config = this.pluginCtx.getPlayConfig();
    const since = Date.now() - this.lastChatAt;
    if (since < config.gameChatMinIntervalMs) {
      await new Promise<void>((r) =>
        setTimeout(r, config.gameChatMinIntervalMs - since),
      );
    }
    this.session.controller.chat(line);
    this.lastChatAt = Date.now();
  }

  private formatGameLines(): string[] {
    return this.session.history.getGameLines().map((l) => {
      switch (l.kind) {
        case "chat":
          return `[game] <${l.username}> ${l.text}`;
        case "whisper":
          return `[whisper] <${l.username}> ${l.text}`;
        case "join":
          return `[join] ${l.username}`;
        case "left":
          return `[left] ${l.username}`;
        case "death":
          return `[death] ${l.username}`;
        case "system":
          return `[system] ${l.text}`;
        default:
          return `[${l.kind}] ${l.text}`;
      }
    });
  }

  private formatSwitchFeedback(result: import("../missions/mission-controller").SwitchResult): string {
    if (result.kind === "applied") {
      return `[mission system] 上次任务已接受: ${result.bundleId} (mission=${result.missionId.slice(0, 8)})。`;
    }
    return `[mission system] 上次任务被拒绝: ${result.reason} - ${result.detail}\n请检查 bundle id 与参数 schema 后重试（可用 \`/missions\` 查看清单），或选 task.idle_wander 兜底。`;
  }
}
