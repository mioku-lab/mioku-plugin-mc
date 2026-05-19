import type { ServerManager } from "../utils/server-manager";
import type { ConfigHandler } from "../utils/config-handler";
import type { McConfig } from "../types";

export async function handleSync(
  serverName: string | undefined,
  enabled: boolean,
  serverManager: ServerManager,
  configHandler: ConfigHandler,
  config: McConfig,
  reply: (text: string) => Promise<void>,
): Promise<boolean> {
  if (!serverName) {
    // show all servers and their sync status
    if (config.servers.length === 0) {
      await reply("暂无已配置的服务器");
      return true;
    }

    const lines = config.servers.map((s) => {
      const syncStatus = s.sync_enabled ? "已开启" : "已关闭";
      return `${s.server_name}: ${syncStatus}`;
    });
    await reply(lines.join("\n"));
    return true;
  }

  const serverItem = configHandler.findServerByName(serverName);
  if (!serverItem) {
    await reply(`未找到服务器「${serverName}」`);
    return true;
  }

  await configHandler.updateServerSync(serverName, enabled);
  const action = enabled ? "开启" : "关闭";
  await reply(`${action}了服务器 ${serverName} 的同步`);
  return true;
}
