import type { MiokiContext } from "mioki";
import type { AIService, AIInstance, ConfigService } from "mioku";
import type { ConfigHandler } from "../utils/config-handler";
import type { PlayPluginContext } from "./context";
import type { PlayConfigHandler } from "./config";
import { PlaySession } from "./session";
import { MainLoop } from "./ai/main-loop";
import { WorkLoop } from "./ai/work-loop";
import { BehaviorEngine } from "./behavior/engine";
import type { Behavior } from "./behavior/base-behavior";
import { EscapeLavaBehavior } from "./behavior/survival/escape-lava";
import { EscapeWaterBehavior } from "./behavior/survival/escape-water";
import { MlgFallBehavior } from "./behavior/survival/mlg-fall";
import { FleeCreeperBehavior } from "./behavior/survival/flee-creeper";
import { AutoEatBehavior } from "./behavior/survival/auto-eat";
import { SelfDefenseBehavior } from "./behavior/catalog/defend";
import type { GroupBinding, PlayServerConfig } from "./types";

export interface PlayManagerOptions {
  ctx: MiokiContext;
  aiService: AIService | undefined;
  configService: ConfigService | undefined;
  playConfigHandler: PlayConfigHandler;
  syncConfigHandler: ConfigHandler;
}

export interface PlayEnterResult {
  success: boolean;
  serverId?: string;
  message: string;
}

export interface PlayExitResult {
  success: boolean;
  message: string;
}

export class PlayManager {
  private readonly ctx: MiokiContext;
  private readonly aiService: AIService | undefined;
  private readonly configService: ConfigService | undefined;
  private readonly playConfigHandler: PlayConfigHandler;
  private readonly syncConfigHandler: ConfigHandler;
  private readonly sessions = new Map<number, PlaySession>();
  private mainInstance?: AIInstance;
  private workInstance?: AIInstance;

  constructor(opts: PlayManagerOptions) {
    this.ctx = opts.ctx;
    this.aiService = opts.aiService;
    this.configService = opts.configService;
    this.playConfigHandler = opts.playConfigHandler;
    this.syncConfigHandler = opts.syncConfigHandler;
  }

  private buildPluginCtx(config: ReturnType<PlayConfigHandler["getConfig"]>): PlayPluginContext {
    return {
      ctx: this.ctx,
      config,
      aiService: this.aiService,
      configService: this.configService,
      syncConfigHandler: this.syncConfigHandler,
      mainInstance: this.mainInstance,
      workInstance: this.workInstance,
      getPlayConfig: () => this.playConfigHandler.getConfig(),
      refreshInstances: () => {
        this.mainInstance = this.aiService?.get("main");
        this.workInstance = this.aiService?.get("work");
      },
    };
  }

  private async ensureInstances(): Promise<void> {
    if (!this.aiService) return;
    this.mainInstance = this.aiService.get("main");
    this.workInstance = this.aiService.get("work");
    if (!this.mainInstance || !this.workInstance) {
      this.ctx.logger.warn(
        "[MC/play] chat 插件未注册 main/work AI 实例，AI 循环不可用（debug 命令仍可用）",
      );
    }
  }

  private buildSurvivalBehaviors(): Behavior[] {
    return [
      new EscapeLavaBehavior(),
      new MlgFallBehavior(),
      new FleeCreeperBehavior(),
      new EscapeWaterBehavior(),
    ];
  }

  private buildOverlays(): Behavior[] {
    const defend = new SelfDefenseBehavior();
    defend.enabled = true;
    const autoEat = new AutoEatBehavior();
    autoEat.enabled = true;
    return [defend, autoEat];
  }

  async enter(
    groupId: number,
    serverId: string,
    opts: { debug?: boolean } = {},
  ): Promise<PlayEnterResult> {
    await this.ensureInstances();

    const debug = opts.debug ?? false;
    const config = this.playConfigHandler.getConfig();
    const binding = this.playConfigHandler.findBinding(groupId);
    if (!binding) {
      return { success: false, message: `未配置群 ${groupId} 的 mc 游玩绑定` };
    }
    const id = String(serverId ?? "").trim();
    if (!binding.allowedServerIds.includes(id)) {
      return {
        success: false,
        message: `服务器 ${id} 未对该群开放（允许: ${binding.allowedServerIds.join(", ") || "无"}）`,
      };
    }
    const server = this.playConfigHandler.findServer(id);
    if (!server) {
      return { success: false, message: `未找到服务器配置 ${id}` };
    }

    const existing = this.sessions.get(groupId);
    if (existing && !existing.isStopped) {
      await existing.stop("reenter");
      this.sessions.delete(groupId);
    }

    const pluginCtx = this.buildPluginCtx(config);
    const session = new PlaySession({
      pluginCtx,
      server,
      binding,
    });
    session.debug = debug;

    const behaviorCtxBuilder = () => {
      const bot = session.controller.bot;
      const movements = session.controller.getMovements();
      if (!bot || !movements) return null;
      return {
        bot,
        movements,
        log: (m: string) => this.ctx.logger.info(`[MC/play] ${m}`),
      };
    };
    const engine = new BehaviorEngine({
      ctxBuilder: behaviorCtxBuilder,
      tickInterval: config.behaviorTickIntervalMs,
      survival: this.buildSurvivalBehaviors(),
      overlays: this.buildOverlays(),
      initialMovement: { behavior: "idle", params: {} },
    });
    const workLoop = new WorkLoop({ session, pluginCtx, engine });
    const mainLoop = new MainLoop({
      session,
      pluginCtx,
      onAction: (action: string) => {
        void workLoop.dispatch(action);
      },
      getBehaviorLabel: () => engine.currentLabel(),
    });
    session.engine = engine;
    session.addCompanion(engine);
    if (!debug) {
      session.addCompanion(workLoop);
      session.addCompanion(mainLoop);
    }
    this.sessions.set(groupId, session);

    try {
      await session.start();
    } catch (err) {
      this.sessions.delete(groupId);
      await session.stop("enter_failed");
      return { success: false, message: `进入服务器失败: ${err}` };
    }
    const mode = debug ? " (debug)" : "";
    return { success: true, serverId: server.id, message: `已进入 ${server.name}${mode}` };
  }

  async exit(groupId: number): Promise<PlayExitResult> {
    const session = this.sessions.get(groupId);
    if (!session || session.isStopped) {
      return { success: false, message: "当前没有进行中的 mc 会话" };
    }
    await session.stop("tool_exit");
    this.sessions.delete(groupId);
    return { success: true, message: "已离开服务器" };
  }

  onQqMessage(event: any): void {
    const groupId = Number(event?.group_id);
    if (!Number.isFinite(groupId) || groupId <= 0) return;
    const session = this.sessions.get(groupId);
    if (!session || session.isStopped) return;
    const text = String(event?.raw_message ?? event?.message ?? "").trim();
    if (!text) return;
    const sender = event?.sender?.card || event?.sender?.nickname || event?.user_id || "群友";
    session.onQqMessage(`[${sender}] ${text}`);
  }

  getStatusList() {
    return [...this.sessions.values()].map((s) => s.getStatus());
  }

  getActiveSession(groupId: number): PlaySession | undefined {
    const s = this.sessions.get(groupId);
    return s && !s.isStopped ? s : undefined;
  }

  async dispose(): Promise<void> {
    await Promise.all(
      [...this.sessions.values()].map((s) =>
        s.stop("shutdown").catch(() => undefined),
      ),
    );
    this.sessions.clear();
  }
}

export interface PlayServer extends PlayServerConfig {}
export interface PlayGroupBinding extends GroupBinding {}

export function createPlayManager(opts: PlayManagerOptions): PlayManager {
  return new PlayManager(opts);
}
