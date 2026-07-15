import { randomUUID } from "node:crypto";
import type { PlayPluginContext } from "./context";
import { BotController } from "./bot/bot-controller";
import { PlayBus } from "./bot/play-bus";
import { buildGoodbyePrompt } from "./ai/prompt";
import type { BehaviorEngine } from "./behavior/engine";
import { withTimeoutMs } from "./util/async";
import { MemoryBus } from "./state/memory-bus";
import { CooldownRegistry } from "./state/cooldowns";
import { EntityScanner } from "./state/sensors/entity-scanner";
import { SnapshotCollector, type BehaviorSnapshot } from "./state/snapshot";
import { PlayEventJournal } from "./state/event-journal";
import { ActionRegistry, type ActionOutcome } from "./actions/registry";
import { TaskRegistry } from "./missions/registry";
import {
  MissionController,
  type SwitchResult,
  type MissionSpec,
  type BundleId,
} from "./missions/mission-controller";
import { followPlayerBundle } from "./missions/bundles/follow-player";
import { gatherResourceBundle } from "./missions/bundles/gather-resource";
import { farmMobsBundle } from "./missions/bundles/farm-mobs";
import { exploreBundle } from "./missions/bundles/explore";
import { idleWanderBundle } from "./missions/bundles/idle-wander";
import { approachPlayerBundle } from "./missions/bundles/approach-player";
import { seekShelterBundle } from "./missions/bundles/seek-shelter";
import type { MissionOutcome } from "./state/mode";
import type {
  GroupBinding,
  MainDirective,
  PlayServerConfig,
  PlaySessionStatus,
} from "./types";

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
  readonly memory = new MemoryBus();
  readonly events = new PlayEventJournal();
  readonly cooldowns = new CooldownRegistry();
  readonly taskRegistry = new TaskRegistry();
  readonly actionRegistry = new ActionRegistry();
  readonly controller: BotController;
  private readonly scanner: EntityScanner;
  startedAt = Date.now();
  connected = false;
  debug = false;
  engine?: BehaviorEngine;
  private missionController?: MissionController;
  private snapshotCollector?: SnapshotCollector;
  private stopped = false;
  private watchdog?: NodeJS.Timeout;
  private companions: PlaySessionCompanion[] = [];
  private qqWindow?: { start: number; count: number };
  private directive: MainDirective | null = null;
  private lastActionOutcome: ActionOutcome | null = null;

  constructor(opts: PlaySessionOptions) {
    this.pluginCtx = opts.pluginCtx;
    const ctx = this.pluginCtx;
    this.server = opts.server;
    this.binding = opts.binding;
    this.controller = new BotController({
      server: opts.server,
      bus: this.bus,
      log: (msg) => ctx.ctx.logger.info(`[MC/play] ${msg}`),
    });
    this.scanner = new EntityScanner({
      bus: this.memory,
      bot: () => this.controller.bot,
      onEvent: (type, data) => this.events.append(type, data),
    });
    this.registerDefaultBundles();
  }

  private registerDefaultBundles(): void {
    this.taskRegistry.register(followPlayerBundle);
    this.taskRegistry.register(gatherResourceBundle);
    this.taskRegistry.register(farmMobsBundle);
    this.taskRegistry.register(exploreBundle);
    this.taskRegistry.register(idleWanderBundle);
    this.taskRegistry.register(approachPlayerBundle);
    this.taskRegistry.register(seekShelterBundle);
  }

  addCompanion(companion: PlaySessionCompanion): void {
    this.companions.push(companion);
  }

  async start(): Promise<void> {
    const ctx = this.pluginCtx;
    ctx.ctx.logger.info(`[MC/play] 正在进入服务器 ${this.server.name} (${this.server.host})`);

    this.bus.on("chat", (line) => {
      this.events.append("game_chat", line);
    });
    this.bus.on("entityHurt", (entity) => {
      const bot = this.controller.bot;
      if (bot?.entity && entity?.id === bot.entity.id) {
        this.events.append("damage", {
          health: bot.health,
          food: bot.food,
          source: entity?.name ?? entity?.username ?? "unknown",
        });
      }
    });
    this.bus.on("death", () => this.events.append("death", { at: Date.now() }));
    this.bus.on("respawn", () => this.events.append("respawn", { at: Date.now() }));
    this.bus.on("inventoryChanged", () => this.scanner.refresh());
    this.bus.on("end", (reason) => this.onUnexpectedEnd(`连接结束: ${reason}`));
    this.bus.on("kicked", (reason) => this.onUnexpectedEnd(`被踢出: ${reason}`));
    this.bus.on("error", () => this.onUnexpectedEnd("bot 错误"));

    await this.controller.connect();
    await this.controller.waitForChunksLoaded();
    this.connected = true;
    this.scanner.refresh();
    this.scanner.start();
    this.startWatchdog();

    for (const companion of this.companions) companion.start?.();
    ctx.ctx.logger.info(`[MC/play] 已进入 ${this.server.name}`);
  }

  onQqMessage(text: string): void {
    this.events.append("qq_chat", { text });
  }

  private startWatchdog(): void {
    this.watchdog = setInterval(() => this.tick(), 1_000);
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
    this.missionController?.tick();
    if (elapsed >= this.server.maxPlayMs) {
      void this.stop("time_up");
    }
  }

  async stop(reason: string, opts: { skipGoodbye?: boolean } = {}): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    this.stopWatchdog();
    this.scanner.stop();

    for (const companion of this.companions) companion.stop?.();

    if (this.connected && this.controller.isOnline()) {
      if (!opts.skipGoodbye) await this.sayGoodbye();
      await this.controller.disconnect("leaving");
    }
    this.connected = false;
    this.bus.removeAll();
    this.memory.clear();
    this.events.clear();

    const ctx = this.pluginCtx;
    ctx.ctx.logger.info(`[MC/play] 已离开 ${this.server.name} (reason: ${reason})`);
  }

  private async onUnexpectedEnd(reason: string): Promise<void> {
    if (this.stopped) return;
    this.connected = false;
    this.stopWatchdog();
    this.scanner.stop();
    for (const companion of this.companions) companion.stop?.();
    this.stopped = true;
    this.bus.removeAll();
    this.memory.clear();
    this.events.clear();

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

  stopMovement(): void {
    this.engine?.stopMission();
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

  getMemorySnapshot(): Record<string, { value: unknown; ageMs: number }> {
    return this.memory.snapshot();
  }

  getBehaviorSnapshot(): BehaviorSnapshot | null {
    if (!this.engine) return null;
    if (!this.snapshotCollector) {
      this.snapshotCollector = new SnapshotCollector({
        bus: this.memory,
        engine: this.engine,
        cooldowns: this.cooldowns,
        getContext: () => this.buildBehaviorContext(),
        getMission: () => this.getCurrentMission(),
        getLastOutcome: () => this.getLastMissionOutcome(),
      });
    }
    return this.snapshotCollector.collect();
  }

  listBundles(): Array<{ id: string; description: string; mode: string | null }> {
    return this.taskRegistry.list();
  }

  describeBundles(): ReturnType<TaskRegistry["describe"]> {
    return this.taskRegistry.describe();
  }

  listActions(): Array<{ name: string; description: string }> {
    return this.actionRegistry.list();
  }

  startMission(spec: MissionSpec): SwitchResult {
    if (!this.engine) {
      return {
        kind: "rejected",
        reason: "no_bot_session",
        detail: "engine 尚未初始化",
      };
    }
    if (!this.missionController) {
      this.missionController = new MissionController({
        registry: this.taskRegistry,
        engine: this.engine,
        bus: this.memory,
        buildContext: () => this.buildBehaviorContext(),
        log: (msg) => this.pluginCtx.ctx.logger.info(`[MC/play] ${msg}`),
        onOutcome: (outcome) => this.handleMissionOutcome(outcome),
      });
    }
    return this.missionController.startMission(spec);
  }

  stopMission(reason?: string): SwitchResult {
    if (!this.missionController) {
      return {
        kind: "rejected",
        reason: "rejected_by_engine",
        detail: "没有进行中的任务",
      };
    }
    return this.missionController.stopMission(reason);
  }

  getCurrentMission(): import("./state/mode").MissionState | null {
    return this.missionController?.getCurrentMission() ?? null;
  }

  getLastMissionOutcome(): MissionOutcome | null {
    return this.missionController?.getLastOutcome() ?? null;
  }

  setDirective(goal: string, replace = true): MainDirective {
    const now = Date.now();
    if (this.directive?.status === "active" && !replace) {
      this.directive = {
        ...this.directive,
        goal: `${this.directive.goal}\nAdditional goal: ${goal.trim()}`,
        updatedAt: now,
      };
      this.events.append("directive", this.directive);
      return { ...this.directive };
    }
    if (this.directive && replace) {
      this.directive = { ...this.directive, status: "cancelled", updatedAt: now };
    }
    const directive: MainDirective = {
      id: randomUUID(),
      goal: goal.trim(),
      source: "main",
      createdAt: now,
      updatedAt: now,
      status: "active",
    };
    this.directive = directive;
    this.events.append("directive", directive);
    return { ...directive };
  }

  getDirective(): MainDirective | null {
    return this.directive ? { ...this.directive } : null;
  }

  completeDirective(id: string, status: "completed" | "cancelled" = "completed"): void {
    if (!this.directive || this.directive.id !== id) return;
    this.directive = { ...this.directive, status, updatedAt: Date.now() };
  }

  requestMainAttention(reason: string): void {
    this.events.append("main_attention", { reason });
  }

  async performAction(
    action: string,
    params: Record<string, unknown>,
    meta: { directiveId?: string; completesDirectiveOnSuccess?: boolean } = {},
  ): Promise<ActionOutcome> {
    const bot = this.controller.bot;
    if (!bot) {
      const outcome: ActionOutcome = {
        action,
        status: "failed",
        code: "disconnected",
        detail: "bot 尚未连接",
        at: Date.now(),
        directiveId: meta.directiveId,
        completesDirectiveOnSuccess: meta.completesDirectiveOnSuccess ?? true,
      };
      this.recordActionOutcome(outcome);
      return outcome;
    }
    const outcome = await this.actionRegistry.execute(
      action,
      params,
      {
        bot,
        server: this.server,
        stopCurrentTask: (reason) => {
          this.stopMission(reason);
        },
      },
      meta,
    );
    this.recordActionOutcome(outcome);
    return outcome;
  }

  getLastActionOutcome(): ActionOutcome | null {
    return this.lastActionOutcome ? { ...this.lastActionOutcome } : null;
  }

  private lastSwitchResult: SwitchResult | null = null;

  recordSwitchResult(result: SwitchResult): void {
    this.lastSwitchResult = result;
  }

  consumeLastSwitchResult(): SwitchResult | null {
    const r = this.lastSwitchResult;
    this.lastSwitchResult = null;
    return r;
  }

  private buildBehaviorContext(): import("./behavior/base-behavior").BehaviorContext | null {
    const bot = this.controller.bot;
    const movements = this.controller.getMovements();
    if (!bot || !movements) return null;
    return { bot, movements, log: (m: string) => this.pluginCtx.ctx.logger.info(`[MC/play] ${m}`) };
  }

  private handleMissionOutcome(outcome: MissionOutcome): void {
    if (
      outcome.status === "succeeded" &&
      outcome.directiveId &&
      outcome.completesDirectiveOnSuccess
    ) {
      this.completeDirective(outcome.directiveId);
    }
    this.events.append("mission_outcome", {
      ...outcome,
      directiveActive: this.directive?.status === "active",
    });
  }

  private recordActionOutcome(outcome: ActionOutcome): void {
    this.lastActionOutcome = outcome;
    if (
      outcome.status === "succeeded" &&
      outcome.directiveId &&
      outcome.completesDirectiveOnSuccess
    ) {
      this.completeDirective(outcome.directiveId);
    }
    this.events.append("action_outcome", {
      ...outcome,
      directiveActive: this.directive?.status === "active",
    });
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
      lastAction: this.lastActionOutcome?.action ?? this.directive?.goal ?? null,
    };
  }

  get isStopped(): boolean {
    return this.stopped;
  }
}
