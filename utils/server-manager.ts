import {
  createForwardClient,
  createReverseServer,
  type WsClient,
  type WsServer,
} from "../core/ws-factory";
import type { McConfig, McEvent } from "../types";
import type { QueQiaoEvent } from "@cikeyqi/queqiao-node-sdk";

export type StatusCallback = (serverName: string, status: string) => void;
export type EventCallback = (event: McEvent) => void;

export function createServerManager(
  onStatusChange: StatusCallback,
  onMcEvent: EventCallback,
  logger?: { error: (msg: string) => void },
) {
  const forwardClients = new Map<string, WsClient>();
  let reverseServer: WsServer | null = null;

  const handleEvent = (event: QueQiaoEvent) => {
    onMcEvent(event as McEvent);
  };

  const handleError = (serverName: string, error: Error) => {
    logger?.error(`[MC] 服务器 ${serverName} 连接错误: ${error.message}`);
  };

  const handleClose = (serverName: string, code: number, reason: string) => {
    logger?.error(`[MC] 服务器 ${serverName} 连接断开: code=${code} reason=${reason || '-'}`);
  };

  const startServers = (config: McConfig) => {
    // close existing
    stopServers();

    // start reverse server if enabled (global, one instance)
    if (config.reverse_ws_enabled && config.reverse_ws_port) {
      reverseServer = createReverseServer(config, handleEvent, onStatusChange, handleError);
    }

    // start new forward connections
    for (const server of config.servers) {
      if (!server.server_name) continue;

      // skip if sync is disabled
      if (server.sync_enabled === false) continue;

      // Forward WS: bot connects to MC server
      if (server.forward_ws_enabled !== false && server.ws_url) {
        const client = createForwardClient(server, handleEvent, onStatusChange, handleError);
        forwardClients.set(server.server_name, client);
      }
    }
  };

  const stopServers = () => {
    forwardClients.forEach((client) => client.close());
    forwardClients.clear();
    reverseServer?.close();
    reverseServer = null;
  };

  const reconnectAll = () => {
    forwardClients.forEach((client) => client.close());
    forwardClients.clear();
    reverseServer?.close();
    reverseServer = null;
  };

  const getClient = (serverName: string) => forwardClients.get(serverName) || null;

  const getConnectedNames = () => {
    const names: string[] = [];
    forwardClients.forEach((client, name) => {
      if (client.status === "connected") {
        names.push(name);
      }
    });
    return names;
  };

  const isServerConnected = (serverName: string) => {
    const client = forwardClients.get(serverName);
    return client?.status === "connected";
  };

  const sendToServer = async (
    serverName: string,
    api: string,
    data: Record<string, unknown>,
  ) => {
    const client = forwardClients.get(serverName);
    if (!client) {
      throw new Error(`服务器 ${serverName} 未配置`);
    }
    if (client.status !== "connected") {
      throw new Error(`服务器 ${serverName} 未连接`);
    }
    return client.send({ type: api, ...data });
  };

  const getStatusList = () => {
    const list: Array<{ name: string; status: string }> = [];
    forwardClients.forEach((client, name) => {
      list.push({ name, status: client.status });
    });
    if (reverseServer) {
      list.push({ name: "reverse", status: reverseServer.status });
    }
    return list;
  };

  return {
    startServers,
    stopServers,
    reconnectAll,
    getClient,
    getConnectedNames,
    isServerConnected,
    sendToServer,
    getStatusList,
  };
}

export type ServerManager = ReturnType<typeof createServerManager>;