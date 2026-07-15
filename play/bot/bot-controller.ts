import { createBot, type Bot } from "mineflayer";
import mcData from "minecraft-data";
import type { PlayServerConfig } from "../types";
import { resolveMinecraftEndpoint } from "../util/endpoint";
import { withTimeoutMs } from "../util/async";
import { PlayBus, type GameChatLine } from "./play-bus";
import {
  PathEngine,
  DEFAULT_MOVEMENTS,
  type MovementsConfig,
} from "../path-engine";
import { Combat } from "../combat";

const PVP_FOLLOW_RANGE = 2;
const PVP_ATTACK_RANGE = 3.0;

export interface BotControllerOptions {
  server: PlayServerConfig;
  bus: PlayBus;
  log: (msg: string) => void;
}

export class BotController {
  bot: Bot | null = null;
  readonly server: PlayServerConfig;
  private readonly bus: PlayBus;
  private readonly log: (msg: string) => void;
  private pathEngine?: PathEngine;
  private combat?: Combat;
  private joinedOnce = false;

  constructor(opts: BotControllerOptions) {
    this.server = opts.server;
    this.bus = opts.bus;
    this.log = opts.log;
  }

  async connect(): Promise<void> {
    const { host, port } = await resolveMinecraftEndpoint(this.server.host);
    const bot = createBot({
      host,
      port,
      username: this.server.username,
      auth: this.server.auth ?? "offline",
      password: this.server.password,
      version: this.server.version || undefined,
      viewDistance: "normal",
    } as any);
    this.bot = bot;

    this.attachListeners(bot);

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const clean = () => {
        bot.removeListener("spawn", onSpawn);
        bot.removeListener("error", onEarlyError);
        bot.removeListener("end", onEarlyEnd);
        bot.removeListener("kicked", onEarlyKicked);
      };
      const onSpawn = () => {
        if (settled) return;
        settled = true;
        this.setupPathEngine();
        clean();
        resolve();
      };
      const onEarlyError = (err: Error) => {
        if (settled) return;
        settled = true;
        clean();
        reject(err);
      };
      const onEarlyEnd = (reason: string) => {
        if (settled) return;
        settled = true;
        clean();
        reject(new Error(`连接结束: ${reason}`));
      };
      const onEarlyKicked = (reason: string) => {
        if (settled) return;
        settled = true;
        clean();
        reject(new Error(`被服务器踢出: ${reason}`));
      };
      bot.once("spawn", onSpawn);
      bot.once("error", onEarlyError);
      bot.once("end", onEarlyEnd);
      bot.once("kicked", onEarlyKicked);
    });
  }

  private attachListeners(bot: Bot): void {
    bot.on("spawn", () => {
      this.setupPathEngine();
      this.bus.emit("spawn");
      if (!this.joinedOnce) {
        this.joinedOnce = true;
        this.scheduleJoinCommands();
      }
    });
    bot.on("chat", (username: string, message: string) => {
      if (username === bot.username) return;
      this.emitChat({ kind: "chat", username, text: message, at: Date.now() });
    });
    bot.on("whisper", (username: string, message: string) => {
      if (username === bot.username) return;
      this.emitChat({
        kind: "whisper",
        username,
        text: message,
        at: Date.now(),
      });
    });
    bot.on("messagestr", (message: string) => {
      const text = String(message || "").trim();
      if (!text) return;
      this.emitChat({ kind: "system", text, at: Date.now() });
    });
    bot.on("playerJoined", (player: any) => {
      const name = player?.username;
      if (!name || name === bot.username) return;
      this.bus.emit("playerJoined", name);
      this.emitChat({
        kind: "join",
        username: name,
        text: `${name} 加入了游戏`,
        at: Date.now(),
      });
    });
    bot.on("playerLeft", (player: any) => {
      const name = player?.username;
      if (!name || name === bot.username) return;
      this.bus.emit("playerLeft", name);
      this.emitChat({
        kind: "left",
        username: name,
        text: `${name} 离开了游戏`,
        at: Date.now(),
      });
    });
    bot.on("health", () => this.bus.emit("health"));
    bot.on("death", () => {
      this.bus.emit("death");
      this.emitChat({
        kind: "death",
        username: bot.username,
        text: `${bot.username} 死亡了`,
        at: Date.now(),
      });
    });
    bot.on("respawn", () => this.bus.emit("respawn"));
    bot.on("entityHurt", (entity: any) => this.bus.emit("entityHurt", entity));
    (bot as any).on("playerCollect", (collector: any) => {
      if (collector?.id === bot.entity?.id) this.bus.emit("inventoryChanged");
    });
    (bot as any).on("heldItemChanged", () => this.bus.emit("inventoryChanged"));
    (bot.inventory as any)?.on?.("updateSlot", () => this.bus.emit("inventoryChanged"));
    bot.on("physicTick", () => this.bus.emit("physicTick"));
    bot.on("kicked", (reason: string) =>
      this.bus.emit("kicked", String(reason || "")),
    );
    bot.on("end", (reason: string) =>
      this.bus.emit("end", String(reason || "")),
    );
    bot.on("error", (err: Error) => {
      this.log(`bot 错误: ${err}`);
      this.bus.emit("error", err);
    });
  }

  private setupPathEngine(): void {
    const bot = this.bot;
    if (!bot) return;
    try {
      const movements: MovementsConfig = { ...DEFAULT_MOVEMENTS };
      this.pathEngine = new PathEngine(bot, (m) => this.log(m));
      this.pathEngine.setMovements(movements);
      this.pathEngine.thinkTimeout = 5_000;
      this.pathEngine.tickTimeout = 40;
      (bot as any).pathEngine = this.pathEngine;
      this.combat = new Combat(bot, movements);
      this.combat.followRange = PVP_FOLLOW_RANGE;
      this.combat.attackRange = PVP_ATTACK_RANGE;
      (bot as any).combat = this.combat;
      this.log(
        `PathEngine + Combat 已初始化 canDig=${movements.canDig} parkour=${movements.allowParkour} sprint=${movements.allowSprinting} tower=${movements.allow1by1towers} thinkTimeout=${this.pathEngine.thinkTimeout}`,
      );
    } catch (err) {
      this.log(`初始化 PathEngine 失败: ${err}`);
    }
  }

  getMovements(): MovementsConfig | undefined {
    return this.pathEngine?.movements;
  }

  async waitForChunksLoaded(): Promise<void> {
    const bot = this.bot;
    if (!bot) return;
    const deadline = Date.now() + 20_000;
    try {
      await withTimeoutMs((bot as any).waitForChunksToLoad(), 20_000);
    } catch {
      this.log("等待区块加载超时，继续确认脚下方块");
    }
    while (Date.now() < deadline) {
      const feet = bot.entity?.position;
      if (feet && bot.blockAt(feet) != null) {
        this.log("区块加载完成（脚下方块就绪）");
        return;
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    this.log("脚下区块仍未加载，物理 tick 可能跳过");
  }

  private scheduleJoinCommands(): void {
    const cmds = this.server.joinCommands ?? [];
    if (cmds.length === 0) return;
    const run = () => {
      const bot = this.bot;
      if (!bot) return;
      cmds.forEach((cmd, i) => {
        setTimeout(() => {
          try {
            bot.chat(cmd);
          } catch (e) {
            this.log(`执行加入命令失败 (${i}): ${e}`);
          }
        }, i * 1_000);
      });
    };
    setTimeout(run, 2_000);
  }

  private emitChat(line: GameChatLine): void {
    this.bus.emit("chat", line);
  }

  chat(message: string): void {
    const bot = this.bot;
    if (!bot) return;
    try {
      bot.chat(message);
    } catch (err) {
      this.log(`发送聊天失败: ${err}`);
    }
  }

  async disconnect(reason = "leaving"): Promise<void> {
    const bot = this.bot;
    if (!bot) return;
    try {
      this.pathEngine?.stop();
    } catch {
      // ignore
    }
    try {
      bot.quit(reason);
    } catch {
      // ignore
    }
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => resolve(), 2_000);
      bot.once("end", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  isOnline(): boolean {
    return !!this.bot && !!(this.bot as any).entity;
  }
}
