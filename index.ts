import { definePlugin, type MiokuContext } from "mioku";
import { getService, Services } from "mioku";
import { createConfigHandler } from "./utils/config-handler";
import { createPlayConfigHandler } from "./play/config";
import { createPlayManager } from "./play";
import { createMcSkill } from "./skills/mc";
import { handleDebugCommand } from "./play/debug/commands";
import { createServerManager } from "./utils/server-manager";
import { handleStatus } from "./handlers/status";
import { handleSync } from "./handlers/sync";
import { handleReconnect } from "./handlers/reconnect";
import { formatMcEvent, formatQqToMc } from "./utils/message-formatter";
import {
  parseCommand,
  isCommandAllowed,
  formatCommandResult,
} from "./core/rcon";
import type { McEvent } from "./types";
import type { McConfig } from "./types";

export default definePlugin({
  name: "mc",

  async setup(ctx: MiokuContext) {
    const configService = getService(ctx, Services.Config);

    const configHandler = createConfigHandler(configService);
    await configHandler.register();

    const config = configHandler.getConfig();

    const playConfigHandler = createPlayConfigHandler(configService);
    await playConfigHandler.register();

    const aiService = getService(ctx, Services.AI);

    const playManager = createPlayManager({
      ctx,
      aiService,
      configService,
      playConfigHandler,
      syncConfigHandler: configHandler,
    });
    ctx.logger.info("Minecraft 游玩子系统已就绪");

    if (aiService) {
      aiService.registerSkill(createMcSkill(playManager));
    }

    const serverManager = createServerManager(
      (serverName, status) => {
        ctx.logger.info(`[MC] 服务器 ${serverName} 状态: ${status}`);
      },
      (event: McEvent) => {
        handleMcEvent(ctx, event, config, configHandler);
      },
      {
        error: (msg: string) => ctx.logger.error(msg),
      },
    );

    serverManager.startServers(config);

    ctx.handle("message", async (event) => {
      const text = ctx.text(event).trim();
      const groupId = String(event.group_id ?? "").trim() || undefined;

      if (groupId) {
        const reply = await handleDebugCommand({
          text,
          isMaster: ctx.isMaster?.(event) ?? false,
          debugEnabled: playConfigHandler.getConfig().debug.enabled,
          playManager,
          groupId,
        });
        if (reply !== null) {
          await event.reply(reply);
          return;
        }
      }

      if (groupId) {
        await forwardToMc(ctx, event, config, configHandler, serverManager);
      }
    });

    const replyWithEvent = (event: import("mioku").MessageEvent) =>
      async (msg: string) => {
        await event.reply(msg);
      };

    ctx.command({
      id: "mc-status",
      name: "mc-status",
      prefixes: ["/", "."],
      match: /^mc\s+状态\s*$/,
      permission: "master",
      description: "查看所有已配置服务器的WebSocket连接状态，包括连接中、已断开等",
      async handler({ event }) {
        await handleStatus(serverManager, config, replyWithEvent(event));
      },
    });

    ctx.command({
      id: "mc-sync-on",
      name: "mc-sync-on",
      prefixes: ["/", "."],
      match: /^mc\s+开启同步(?:\s+(.+))?$/,
      description: "开启指定服务器的群聊消息同步功能，开启后该服务器可接收和发送群聊消息",
      usage: ".mc 开启同步 <服务器名称>",
      permission: "master",
      async handler({ event, args }) {
        await handleSync(args[0], true, serverManager, configHandler, config, replyWithEvent(event));
      },
    });

    ctx.command({
      id: "mc-sync-off",
      name: "mc-sync-off",
      prefixes: ["/", "."],
      match: /^mc\s+关闭同步(?:\s+(.+))?$/,
      description: "关闭指定服务器的群聊消息同步功能，关闭后该服务器不再接收和发送群聊消息",
      usage: ".mc 关闭同步 <服务器名称>",
      permission: "master",
      async handler({ event, args }) {
        await handleSync(args[0], false, serverManager, configHandler, config, replyWithEvent(event));
      },
    });

    ctx.command({
      id: "mc-reconnect",
      name: "mc-reconnect",
      prefixes: ["/", "."],
      match: /^mc\s+重连\s*$/,
      permission: "master",
      description: "断开并重新建立所有服务器的WebSocket连接，用于连接异常时手动恢复",
      async handler({ event }) {
        await handleReconnect(serverManager, replyWithEvent(event));
      },
    });

    ctx.logger.info("Minecraft插件加载成功");

    return async () => {
      serverManager.stopServers();
      await playManager.dispose();
      if (aiService) aiService.removeSkill("mc");
      ctx.logger.info("Minecraft插件已卸载");
    };
  },
});

async function handleMcEvent(
  ctx: MiokuContext,
  event: McEvent,
  config: McConfig,
  configHandler: ReturnType<typeof createConfigHandler>,
) {
  const messageText = formatMcEvent(event, config);
  if (!messageText) return;

  const serverName = event.server_name || "";
  const serverItem = configHandler.findServerByName(serverName);
  if (!serverItem) return;

  if (serverItem.sync_enabled === false) return;

  const botList = serverItem.bot_self_id || "";
  const groupList = serverItem.group_list || "";

  const bots = botList ? [botList] : [];
  const groups = groupList ? [groupList] : [];

  for (const botId of bots) {
    const bot = ctx.pickBot(botId);
    if (!bot) continue;

    for (const groupId of groups) {
      try {
        await bot.sendMessage({ type: "group", group_id: groupId}, messageText);
      } catch (err) {
        ctx.logger.error(`[MC] 发送消息到群 ${groupId} 失败: ${err}`);
      }
    }
  }
}

async function forwardToMc(
  ctx: MiokuContext,
  event: any,
  config: McConfig,
  configHandler: ReturnType<typeof createConfigHandler>,
  serverManager: ReturnType<typeof createServerManager>,
) {
  const text = ctx.text(event);
  ctx.logger.debug(`[MC] 收到群消息 group=${event.group_id} text=${text}`);

  const groupId = String(event.group_id ?? "").trim();
  if (!groupId) return;

  const servers = configHandler.getServersForGroup(groupId);
  if (servers.length === 0) return;

  const msgList = Array.isArray(event.message)
    ? event.message
    : [{ type: "text", text: text }];

  for (const server of servers) {
    if (server.sync_enabled === false) continue;

    const commandText = parseCommand(text, server);
    if (commandText !== null) {
      if (server.rcon_enabled === false) continue;

      const isAllowed = isCommandAllowed(
        commandText,
        server,
        ctx.isMaster?.(event) ?? false,
        event.user_id ?? "",
      );

      if (isAllowed) {
        try {
          const result = await serverManager.sendToServer(
            server.server_name,
            "send_rcon_command",
            { command: commandText },
          );
          await event.reply(formatCommandResult(result));
        } catch (err) {
          await event.reply(`执行命令失败: ${err}`);
        }
      }
      continue;
    }

    try {
      const mcMessage = formatQqToMc(
        event.sender || {},
        msgList,
        config,
        server,
      );
      await serverManager.sendToServer(server.server_name, "broadcast", {
        message: mcMessage,
      });
    } catch (err) {
      ctx.logger.error(`[MC] 发送到服务器 ${server.server_name} 失败: ${err}`);
    }
  }
}