import { createBot, type Bot } from "mineflayer";
import { pathfinder, Movements } from "mineflayer-pathfinder";
import { plugin as pvpPlugin } from "mineflayer-pvp";
import mcData from "minecraft-data";
import type { PlayServerConfig } from "../types";
import { resolveMinecraftEndpoint } from "../util/endpoint";
import { PlayBus, type GameChatLine } from "./play-bus";

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
  private movements?: Movements;
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
      viewDistance: "short",
    } as any);
    this.bot = bot;

    try {
      bot.loadPlugin(pathfinder);
      bot.loadPlugin(pvpPlugin);
    } catch (err) {
      this.log(`加载 mineflayer 插件失败: ${err}`);
    }

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
        this.setupMovements();
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
      this.setupMovements();
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

  private emitChat(line: GameChatLine): void {
    this.bus.emit("chat", line);
  }

  private setupMovements(): void {
    const bot = this.bot;
    if (!bot) return;
    try {
      this.movements = new Movements(bot);
      this.movements.canDig = true;
      this.movements.allowSprinting = true;
      this.movements.allowParkour = true;
      this.movements.allow1by1towers = true;
      this.movements.maxDropDown = 4;
      bot.pathfinder.setMovements(this.movements);
    } catch (err) {
      this.log(`初始化 Movements 失败: ${err}`);
    }
  }

  getMovements(): Movements | undefined {
    return this.movements;
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
    this.bot = null;
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
