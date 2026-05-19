import {
  createClient,
  createReverseClient,
  type QueQiaoClient,
  type QueQiaoEvent,
  type KnownApi,
} from "@cikeyqi/queqiao-node-sdk";
import type { McConfig, ServerConfig } from "../types";

export interface WsClient {
  serverName: string;
  config: ServerConfig;
  status: "connected" | "disconnected" | "connecting";
  send(data: Record<string, unknown>): Promise<void>;
  close(): void;
}

export interface WsServer {
  status: "listening" | "stopped";
  close(): void;
}

type EventHandler = (event: QueQiaoEvent) => void;
type StatusHandler = (serverName: string, status: string) => void;
type ErrorHandler = (serverName: string, error: Error) => void;

// Safe string normalizer - empty string becomes undefined, otherwise trimmed
function safeString(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function createForwardClient(
  serverItem: ServerConfig,
  onEvent: EventHandler,
  onStatusChange: StatusHandler,
  onError?: ErrorHandler,
): WsClient {
  let client: QueQiaoClient | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempt = 0;
  let currentStatus: "connected" | "disconnected" | "connecting" = "disconnected";

  const updateStatus = (status: "connected" | "disconnected" | "connecting") => {
    currentStatus = status;
    onStatusChange(serverItem.server_name, status);
  };

  const connect = () => {
    if (client) {
      client.close().catch(() => {});
      client = null;
    }
    updateStatus("connecting");

    const accessToken = safeString(serverItem.ws_password);

    client = createClient(
      [
        {
          url: serverItem.ws_url,
          selfName: serverItem.server_name,
          accessToken: accessToken,
        },
      ],
      {
        reconnect: false,
      },
    );

    client.on("connection_open", (_selfName: string) => {
      reconnectAttempt = 0;
      updateStatus("connected");
    });

    client.on("connection_close", (_selfName: string, _code: number, _reason: string) => {
      updateStatus("disconnected");
      scheduleReconnect();
    });

    client.on("connection_error", (_selfName: string, error: Error) => {
      onError?.(serverItem.server_name, error);
      updateStatus("disconnected");
    });

    client.on("event", (eventData: QueQiaoEvent) => {
      onEvent(eventData);
    });

    client.on("error", () => {});

    client.connect().catch((err: Error) => {
      onError?.(serverItem.server_name, err);
      updateStatus("disconnected");
      scheduleReconnect();
    });
  };

  const scheduleReconnect = () => {
    if (reconnectTimer) return;
    const maxAttempts = serverItem.ws_max_attempts || 0;

    reconnectAttempt++;
    if (maxAttempts > 0 && reconnectAttempt > maxAttempts) {
      return;
    }

    // Exponential backoff: 10s, 20s, 30s, ... up to 60s
    const baseDelay = 10000;
    const delay = Math.min(baseDelay * reconnectAttempt, 60000);

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  };

  const send = async (data: Record<string, unknown>): Promise<void> => {
    const api = data.type as string;
    const apiData = { ...data };
    delete apiData.type;

    if (!client || !client.isOpen({ selfName: serverItem.server_name })) {
      throw new Error(`服务器 ${serverItem.server_name} 未连接`);
    }
    await client.request(
      api as KnownApi,
      apiData as Record<string, unknown>,
      { selfName: serverItem.server_name },
    );
  };

  const close = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    client?.close().catch(() => {});
    client = null;
    updateStatus("disconnected");
  };

  connect();

  return {
    serverName: serverItem.server_name,
    config: serverItem,
    get status() {
      return currentStatus;
    },
    send,
    close,
  };
}

export function createReverseServer(
  config: McConfig,
  onEvent: EventHandler,
  onStatusChange: StatusHandler,
  onError?: ErrorHandler,
): WsServer {
  let client: QueQiaoClient | null = null;

  const updateStatus = (status: "listening" | "stopped") => {
    onStatusChange("reverse", status);
  };

  const start = () => {
    if (!config.reverse_ws_port) {
      return;
    }

    const accessToken = safeString(config.reverse_ws_password);

    client = createReverseClient(
      {
        port: config.reverse_ws_port,
        path: config.reverse_ws_path || "/minecraft/ws",
        host: "0.0.0.0",
      },
      accessToken ? { accessToken } : {},
    );

    client.on("connection_open", (_selfName: string) => {
      updateStatus("listening");
    });

    client.on("connection_close", (_selfName: string, _code: number, _reason: string) => {
      updateStatus("stopped");
    });

    client.on("connection_error", (_selfName: string, error: Error) => {
      onError?.("reverse", error);
    });

    client.on("event", (eventData: QueQiaoEvent) => {
      onEvent(eventData);
    });

    client.on("error", () => {});

    client.connect().catch((err: Error) => {
      onError?.("reverse", err);
      updateStatus("stopped");
    });
  };

  const close = () => {
    client?.close().catch(() => {});
    client = null;
    updateStatus("stopped");
  };

  start();

  return {
    get status() {
      return client ? "listening" : "stopped";
    },
    close,
  };
}