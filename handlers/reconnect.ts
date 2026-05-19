import type { ServerManager } from "../utils/server-manager";

export function handleReconnect(
  serverManager: ServerManager,
  reply: (text: string) => Promise<void>,
) {
  serverManager.reconnectAll();
  return reply("已发起重新连接请求");
}
