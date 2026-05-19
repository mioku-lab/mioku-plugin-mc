import { definePlugin, type MiokiContext } from "mioki";
import type { ConfigService } from "../../src/services/config/tpyes";
import { createConfigHandler } from "./utils/config-handler";
import { createServerManager } from "./utils/server-manager";
import { parseMcCommand } from "./utils/command-router";
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
  version: "1.0.0",
  description: "Minecraft服务器与QQ群消息互通插件",

  async setup(ctx: MiokiContext) {
    const configService = ctx.services?.config as ConfigService | undefined;

    const configHandler = createConfigHandler(configService);
    await configHandler.register();

    const config = configHandler.getConfig();

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

    ctx.handle("message", async (event: any) => {
      const text = ctx.text(event).trim();
      const parsed = parseMcCommand(text);

      if (!parsed || parsed.action === "") {
        if (event.group_id) {
          await forwardToMc(ctx, event, config, configHandler, serverManager);
        }
        return;
      }

      switch (parsed.action) {
        case "状态": {
          await handleStatus(serverManager, config, (msg) => event.reply(msg));
          break;
        }
        case "开启同步": {
          const serverName = parsed.args[0];
          await handleSync(
            serverName,
            true,
            serverManager,
            configHandler,
            config,
            (msg) => event.reply(msg),
          );
          break;
        }
        case "关闭同步": {
          const serverName = parsed.args[0];
          await handleSync(
            serverName,
            false,
            serverManager,
            configHandler,
            config,
            (msg) => event.reply(msg),
          );
          break;
        }
        case "重连": {
          if (ctx.isOwner?.(event)) {
            await handleReconnect(serverManager, (msg) => event.reply(msg));
          }
          break;
        }
      }
    });

    ctx.logger.info("Minecraft插件加载成功");

    return () => {
      serverManager.stopServers();
      ctx.logger.info("Minecraft插件已卸载");
    };
  },
});

async function handleMcEvent(
  ctx: MiokiContext,
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
    const bot = ctx.pickBot(Number(botId));
    if (!bot) continue;

    for (const groupId of groups) {
      try {
        await bot.sendGroupMsg(Number(groupId), messageText);
      } catch (err) {
        ctx.logger.error(`[MC] 发送消息到群 ${groupId} 失败: ${err}`);
      }
    }
  }
}

async function forwardToMc(
  ctx: MiokiContext,
  event: any,
  config: McConfig,
  configHandler: ReturnType<typeof createConfigHandler>,
  serverManager: ReturnType<typeof createServerManager>,
) {
  const text = ctx.text(event);
  ctx.logger.debug(`[MC] 收到群消息 group=${event.group_id} text=${text}`);

  // 检查是否为群消息
  if (!event.group_id) {
    return;
  }

  const servers = configHandler.getServersForGroup(event.group_id);
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
        ctx.isOwner?.(event) ?? false,
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
