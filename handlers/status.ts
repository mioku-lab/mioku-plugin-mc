import type { ServerManager } from "../utils/server-manager";
import type { McConfig } from "../types";

export function handleStatus(
  serverManager: ServerManager,
  config: McConfig,
  reply: (text: string) => Promise<void>,
) {
  if (config.servers.length === 0) {
    return reply("暂无已配置的服务器");
  }

  const statusList = serverManager.getStatusList();

  const lines: string[] = [];

  config.servers.forEach((server, index) => {
    if (index > 0) {
      lines.push("");
    }

    const statusObj = statusList.find((s) => s.name === server.server_name);
    const wsStatus = !server.forward_ws_enabled
      ? "未启用"
      : statusObj?.status === "connected"
        ? "已连接"
        : statusObj?.status === "connecting"
          ? "连接中"
          : "未连接";

    const rconStatus = !server.rcon_enabled ? "未启用" : "已连接";

    lines.push(`服务器：${server.server_name}`);
    lines.push(`WebSocket 连接状态：${wsStatus}`);
    lines.push(`RCON 连接状态：${rconStatus}`);
  });

  return reply(lines.join("\n"));
}
