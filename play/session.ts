import type { PlayPluginContext } from "./context";
import { BotController } from "./bot/bot-controller";
import { PlayBus } from "./bot/play-bus";
import { PlayHistory } from "./ai/history";
import { buildGoodbyePrompt } from "./ai/prompt";
import type { BehaviorEngine } from "./behavior/engine";
import { withTimeoutMs } from "./util/async";
import type { BehaviorSpec, GroupBinding, PlayServerConfig, PlaySessionStatus } from "./types";

export interface PlaySessionCompanion {
  start?: () => void;
  stop?: () => void;
}

export interface PlaySessionOptions {
  pluginCtx: PlayPluginContext;
  server: PlayServerConfig;
  binding: GroupBinding;
}

export class PlaySession {
  private readonly pluginCtx: PlayPluginContext;
  readonly server: PlayServerConfig;
  readonly binding: GroupBinding;
  readonly bus = new PlayBus();
  readonly history: PlayHistory;
  readonly controller: BotController;
  startedAt = Date.now();
  connected = false;
  debug = false;
  engine?: BehaviorEngine;
  private stopped = false;
  private watchdog?: NodeJS.Timeout;
  private companions: PlaySessionCompanion[] = [];
  private qqWindow?: { start: number; count: number };

  constructor(opts: PlaySessionOptions) {
    this.pluginCtx = opts.pluginCtx;
    const ctx = this.pluginCtx;
    this.server = opts.server;
    this.binding = opts.binding;
    this.history = new PlayHistory(ctx.config.gameChatHistoryLines, ctx.config.qqHistoryLines);
    this.controller = new BotController({
      server: opts.server,
      bus: this.bus,
      log: (msg) => ctx.ctx.logger.info(`[MC/play] ${msg}`),
    });
  }

  addCompanion(companion: PlaySessionCompanion): void {
    this.companions.push(companion);
  }

  async start(): Promise<void> {
    const ctx = this.pluginCtx;
    ctx.ctx.logger.info(`[MC/play] 正在进入服务器 ${this.server.name} (${this.server.host})`);

    this.bus.on("chat", (line) => this.history.pushGame(line));
    this.bus.on("end", (reason) => this.onUnexpectedEnd(`连接结束: ${reason}`));
    this.bus.on("kicked", (reason) => this.onUnexpectedEnd(`被踢出: ${reason}`));
    this.bus.on("error", () => this.onUnexpectedEnd("bot 错误"));

    await this.controller.connect();
    this.connected = true;
    this.startWatchdog();

    for (const companion of this.companions) companion.start?.();
    ctx.ctx.logger.info(`[MC/play] 已进入 ${this.server.name}`);
  }

  onQqMessage(text: string): void {
    this.history.pushQq(text);
  }

  private startWatchdog(): void {
    this.watchdog = setInterval(() => this.tick(), 10_000);
  }

  private stopWatchdog(): void {
    if (this.watchdog) {
      clearInterval(this.watchdog);
      this.watchdog = undefined;
    }
  }

  private tick(): void {
    if (this.stopped) return;
    const elapsed = Date.now() - this.startedAt;
    if (elapsed >= this.server.maxPlayMs) {
      void this.stop("time_up");
    }
  }

  async stop(reason: string): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    this.stopWatchdog();

    for (const companion of this.companions) companion.stop?.();

    if (this.connected && this.controller.isOnline()) {
      await this.sayGoodbye();
      await this.controller.disconnect("leaving");
    }
    this.connected = false;
    this.bus.removeAll();

    const ctx = this.pluginCtx;
    ctx.ctx.logger.info(`[MC/play] 已离开 ${this.server.name} (reason: ${reason})`);
  }

  private async onUnexpectedEnd(reason: string): Promise<void> {
    if (this.stopped) return;
    this.connected = false;
    this.stopWatchdog();
    for (const companion of this.companions) companion.stop?.();
    this.stopped = true;
    this.bus.removeAll();

    const ctx = this.pluginCtx;
    ctx.ctx.logger.warn(`[MC/play] ${this.server.name} 异常断开: ${reason}`);
    await this.notifyQq(`bot 已从 ${this.server.name} 断开: ${reason}`);
  }

  private async sayGoodbye(): Promise<void> {
    const ctx = this.pluginCtx;
    const main = ctx.mainInstance;
    if (!main) {
      this.controller.chat("我先走啦~");
      return;
    }
    try {
      const persona = main.getPrompt("persona") ?? "";
      const prompt = buildGoodbyePrompt(persona, this.server);
      const text = await withTimeoutMs(
        main.generateText({ prompt, messages: [] }),
        ctx.config.goodbyeTimeoutMs,
      );
      const clean = text
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 2)
        .join(" ");
      this.controller.chat(clean || "我先走啦~");
    } catch {
      this.controller.chat("我先走啦~");
    }
  }

  async notifyQq(message: string): Promise<void> {
    const ctx = this.pluginCtx;
    const bot = ctx.ctx.pickBot(this.binding.botSelfId);
    if (!bot) return;
    try {
      await bot.sendGroupMsg(this.binding.groupId, message);
    } catch (err) {
      ctx.ctx.logger.error(`[MC/play] 发送 QQ 通知失败: ${err}`);
    }
  }

  async sendQq(message: string): Promise<boolean> {
    const ctx = this.pluginCtx;
    const now = Date.now();
    const windowMs = 60_000;
    if (!this.qqWindow) this.qqWindow = { start: now, count: 0 };
    if (now - this.qqWindow.start > windowMs) {
      this.qqWindow = { start: now, count: 0 };
    }
    if (this.qqWindow.count >= ctx.config.qqSendPerMinute) {
      ctx.ctx.logger.warn(`[MC/play] QQ 发送频率达上限，已丢弃: ${message}`);
      return false;
    }
    this.qqWindow.count++;
    const bot = ctx.ctx.pickBot(this.binding.botSelfId);
    if (!bot) return false;
    try {
      await bot.sendGroupMsg(this.binding.groupId, message);
      return true;
    } catch (err) {
      ctx.ctx.logger.error(`[MC/play] 发送 QQ 消息失败: ${err}`);
      return false;
    }
  }

  say(text: string): boolean {
    if (!this.controller.isOnline()) return false;
    this.controller.chat(text);
    return true;
  }

  setMovement(spec: BehaviorSpec): void {
    this.engine?.setMovement(spec);
  }

  stopMovement(): void {
    this.engine?.stopMovement();
  }

  toggleOverlay(name: string, enabled: boolean, params?: Record<string, string>): boolean {
    return this.engine?.toggleOverlay(name, enabled, params) ?? false;
  }

  isOverlayEnabled(name: string): boolean {
    return this.engine?.isOverlayEnabled(name) ?? false;
  }

  clearBehaviors(): void {
    this.engine?.clear();
  }

  getBehaviorStates(): import("./behavior/engine").BehaviorStateInfo[] {
    const engine = this.engine;
    const ctx = this.buildBehaviorContext();
    if (!engine || !ctx) return [];
    return engine.getStates(ctx);
  }

  private buildBehaviorContext(): import("./behavior/base-behavior").BehaviorContext | null {
    const bot = this.controller.bot;
    const movements = this.controller.getMovements();
    if (!bot || !movements) return null;
    return { bot, movements, log: (m: string) => this.pluginCtx.ctx.logger.info(`[MC/play] ${m}`) };
  }

  getStatus(): PlaySessionStatus {
    return {
      serverId: this.server.id,
      serverName: this.server.name,
      groupId: this.binding.groupId,
      botSelfId: this.binding.botSelfId,
      startedAt: this.startedAt,
      connected: this.connected,
      currentBehavior: this.engine?.currentLabel() ?? null,
      lastAction: null,
    };
  }

  get isStopped(): boolean {
    return this.stopped;
  }
}
