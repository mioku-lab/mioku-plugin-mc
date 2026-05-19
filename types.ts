export interface McEvent {
  post_type: string;
  sub_type: string;
  server_name?: string;
  player?: { nickname?: string };
  message?: string;
  raw_message?: unknown;
  death?: { text?: string; translate?: { text?: string } };
  command?: string;
  achievement?: {
    text?: string;
    translate?: { text?: string };
    display?: {
      title?: { text?: string; translate?: { text?: string } };
    };
  };
}

export interface ServerConfig {
  server_name: string;
  ws_url: string;
  ws_password?: string;
  ws_max_attempts?: number;
  group_list: string;
  bot_self_id: string;
  command_header?: string;
  command_user?: string[];
  rcon_command_whitelist?: string[];
  mc_qq_chat_image_enable?: boolean;
  mask_word?: string;
  sync_enabled?: boolean;
  // RCON
  rcon_enabled?: boolean;
  rcon_host?: string;
  rcon_port?: number;
  rcon_password?: string;
  // WebSocket direction control (per server)
  forward_ws_enabled?: boolean;
  reverse_ws_enabled?: boolean;
}

export interface McConfig {
  servers: ServerConfig[];
  say_way: string;
  display_server_name: boolean;
  // Reverse WS server (global, not per-server)
  reverse_ws_enabled?: boolean;
  reverse_ws_port?: number;
  reverse_ws_path?: string;
  reverse_ws_password?: string;
}

export const DEFAULT_CONFIG: McConfig = {
  servers: [],
  say_way: "说：",
  display_server_name: true,
  reverse_ws_enabled: false,
  reverse_ws_port: 8080,
  reverse_ws_path: "/minecraft/ws",
  reverse_ws_password: "",
};

export function normalizeConfig(raw: Partial<McConfig>): McConfig {
  const servers = Array.isArray(raw.servers) ? raw.servers : [];

  return {
    servers: servers.map((s) => ({
      ...s,
      group_list: typeof s.group_list === "string" ? s.group_list.trim() : "",
      bot_self_id: typeof s.bot_self_id === "string" ? s.bot_self_id.trim() : "",
    })),
    say_way: raw.say_way || DEFAULT_CONFIG.say_way,
    display_server_name: raw.display_server_name ?? DEFAULT_CONFIG.display_server_name,
    reverse_ws_enabled: raw.reverse_ws_enabled ?? DEFAULT_CONFIG.reverse_ws_enabled,
    reverse_ws_port: raw.reverse_ws_port ?? DEFAULT_CONFIG.reverse_ws_port,
    reverse_ws_path: raw.reverse_ws_path ?? DEFAULT_CONFIG.reverse_ws_path,
    reverse_ws_password: raw.reverse_ws_password ?? DEFAULT_CONFIG.reverse_ws_password,
  };
}