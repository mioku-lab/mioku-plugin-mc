export interface PlayServerConfig {
  id: string;
  name: string;
  host: string;
  version?: string;
  username: string;
  auth?: "offline" | "microsoft";
  password?: string;
  maxPlayMs: number;
  joinCommands: string[];
  allowedCommands: string[];
}

export interface GroupBinding {
  groupId: number;
  botSelfId: number;
  allowedServerIds: string[];
}

export type PlayToolPermission = "owner" | "admin" | "member";

export interface WorkStatus {
  running: boolean;
  goal: string | null;
  summary: string;
  progress?: { current: number; target: number; unit: string };
  updatedAt: number;
}

export interface PlayConfig {
  servers: PlayServerConfig[];
  groups: GroupBinding[];
  mainChatDebounceMs: number;
  mainConversationFocusMs: number;
  chatScanIntervalMs: number;
  workSubroutineMaxMs: number;
  workSubroutineMaxIterations: number;
  toolPermission: PlayToolPermission;
  behaviorTickIntervalMs: number;
  goodbyeTimeoutMs: number;
  qqSendPerMinute: number;
  gameChatMinIntervalMs: number;
  debug: { enabled: boolean };
}

export const DEFAULT_PLAY_CONFIG: PlayConfig = {
  servers: [],
  groups: [],
  mainChatDebounceMs: 1_000,
  mainConversationFocusMs: 30_000,
  chatScanIntervalMs: 4 * 60_000,
  workSubroutineMaxMs: 5 * 60_000,
  workSubroutineMaxIterations: 25,
  toolPermission: "admin",
  behaviorTickIntervalMs: 200,
  goodbyeTimeoutMs: 8_000,
  qqSendPerMinute: 3,
  gameChatMinIntervalMs: 1_500,
  debug: { enabled: false },
};

export interface MovementInit {
  name: string;
  params?: Record<string, string>;
}

export type MainLoopTrigger =
  | "direct_game_chat"
  | "direct_qq_chat"
  | "chat_scan_due"
  | "work_completed";

export interface PlaySessionStatus {
  serverId: string;
  serverName: string;
  groupId: number;
  botSelfId: number;
  startedAt: number;
  connected: boolean;
  currentBehavior: string | null;
  lastAction: string | null;
  workStatus?: WorkStatus | null;
}

export type PlayEventType =
  | "game_chat"
  | "qq_chat"
  | "damage"
  | "vitals_threshold"
  | "day_phase"
  | "death"
  | "respawn"
  | "inventory_change"
  | "equipment_change"
  | "mission_outcome"
  | "action_outcome"
  | "path_error"
  | "chat_scan_due"
  | "work_completed";

export interface PlayEvent<T = unknown> {
  seq: number;
  at: number;
  type: PlayEventType;
  data: T;
}

export interface EventBatch {
  events: PlayEvent[];
  cursor: number;
}

export class PlayEventJournal {
  private seq = 0;
  private events: PlayEvent[] = [];
  private listeners = new Set<(event: PlayEvent) => void>();

  constructor(private readonly maxEntries = 300) {}

  append<T>(type: PlayEventType, data: T): PlayEvent<T> {
    const event: PlayEvent<T> = {
      seq: ++this.seq,
      at: Date.now(),
      type,
      data,
    };
    this.events.push(event);
    if (this.events.length > this.maxEntries) {
      this.events.splice(0, this.events.length - this.maxEntries);
    }
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Journal consumers must not affect the game loop.
      }
    }
    return event;
  }

  readAfter(
    cursor: number,
    filter?: (event: PlayEvent) => boolean,
    limit?: number,
  ): EventBatch {
    const matched = this.events.filter(
      (event) => event.seq > cursor && (!filter || filter(event)),
    );
    return {
      events: limit && matched.length > limit ? matched.slice(-limit) : matched,
      cursor: matched.at(-1)?.seq ?? cursor,
    };
  }

  subscribe(listener: (event: PlayEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  latestCursor(): number {
    return this.seq;
  }

  clear(): void {
    this.events = [];
    this.listeners.clear();
  }
}

function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((v) => String(v ?? "").trim())
      .filter((v) => v.length > 0);
  }
  if (typeof value === "string") {
    return value
      .split(/[\n,]+/)
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
  }
  return [];
}

function asNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asPositiveNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function normalizeServer(raw: any): PlayServerConfig {
  const auth = raw?.auth === "microsoft" ? "microsoft" : "offline";
  return {
    id: String(raw?.id ?? "").trim(),
    name: String(raw?.name ?? raw?.id ?? "").trim(),
    host: String(raw?.host ?? "").trim(),
    version: raw?.version ? String(raw.version).trim() : undefined,
    username: String(raw?.username ?? "").trim(),
    auth,
    password: raw?.password ? String(raw.password) : undefined,
    maxPlayMs: asPositiveNumber(raw?.maxPlayMs, 30 * 60_000),
    joinCommands: asStringList(raw?.joinCommands),
    allowedCommands: asStringList(raw?.allowedCommands).map((command) =>
      command.startsWith("/") ? command : `/${command}`,
    ),
  };
}

function normalizeBinding(raw: any): GroupBinding {
  return {
    groupId: asNumber(raw?.groupId ?? raw?.group_id, 0),
    botSelfId: asNumber(raw?.botSelfId ?? raw?.bot_self_id, 0),
    allowedServerIds: asStringList(raw?.allowedServerIds ?? raw?.allowed_server_ids),
  };
}

export function normalizePlayConfig(raw: any): PlayConfig {
  const servers = Array.isArray(raw?.servers)
    ? raw.servers.map(normalizeServer).filter((s: PlayServerConfig) => s.id && s.host)
    : [];
  const groups = Array.isArray(raw?.groups)
    ? raw?.groups
        .map(normalizeBinding)
        .filter((g: GroupBinding) => g.groupId > 0 && g.botSelfId > 0)
    : [];
  const perm: PlayToolPermission =
    raw?.toolPermission === "owner" ||
    raw?.toolPermission === "admin" ||
    raw?.toolPermission === "member"
      ? raw.toolPermission
      : DEFAULT_PLAY_CONFIG.toolPermission;

  return {
    servers,
    groups,
    mainChatDebounceMs: asPositiveNumber(
      raw?.mainChatDebounceMs,
      DEFAULT_PLAY_CONFIG.mainChatDebounceMs,
    ),
    mainConversationFocusMs: asPositiveNumber(
      raw?.mainConversationFocusMs,
      DEFAULT_PLAY_CONFIG.mainConversationFocusMs,
    ),
    chatScanIntervalMs: asPositiveNumber(
      raw?.chatScanIntervalMs,
      DEFAULT_PLAY_CONFIG.chatScanIntervalMs,
    ),
    workSubroutineMaxMs: asPositiveNumber(
      raw?.workSubroutineMaxMs,
      DEFAULT_PLAY_CONFIG.workSubroutineMaxMs,
    ),
    workSubroutineMaxIterations: asPositiveNumber(
      raw?.workSubroutineMaxIterations,
      DEFAULT_PLAY_CONFIG.workSubroutineMaxIterations,
    ),
    toolPermission: perm,
    behaviorTickIntervalMs: asPositiveNumber(
      raw?.behaviorTickIntervalMs,
      DEFAULT_PLAY_CONFIG.behaviorTickIntervalMs,
    ),
    goodbyeTimeoutMs: asPositiveNumber(
      raw?.goodbyeTimeoutMs,
      DEFAULT_PLAY_CONFIG.goodbyeTimeoutMs,
    ),
    qqSendPerMinute: asPositiveNumber(
      raw?.qqSendPerMinute,
      DEFAULT_PLAY_CONFIG.qqSendPerMinute,
    ),
    gameChatMinIntervalMs: asPositiveNumber(
      raw?.gameChatMinIntervalMs,
      DEFAULT_PLAY_CONFIG.gameChatMinIntervalMs,
    ),
    debug: {
      enabled:
        raw?.debug && typeof raw.debug === "object"
          ? Boolean(raw.debug.enabled)
          : DEFAULT_PLAY_CONFIG.debug.enabled,
    },
  };
}