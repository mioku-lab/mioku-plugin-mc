export interface PlayServerConfig {
  id: string;
  name: string;
  host: string;
  version?: string;
  username: string;
  auth?: "offline" | "microsoft";
  password?: string;
  maxPlayMs: number;
}

export interface GroupBinding {
  groupId: number;
  botSelfId: number;
  allowedServerIds: string[];
}

export type PlayToolPermission = "owner" | "admin" | "member";

export interface PlayConfig {
  servers: PlayServerConfig[];
  groups: GroupBinding[];
  mainLoopMinIntervalMs: number;
  mainLoopIdleIntervalMs: number;
  toolPermission: PlayToolPermission;
  behaviorTickIntervalMs: number;
  gameChatHistoryLines: number;
  qqHistoryLines: number;
  maxPlayBudgetWarnRatio: number;
  goodbyeTimeoutMs: number;
  qqSendPerMinute: number;
  gameChatMinIntervalMs: number;
  debug: { enabled: boolean };
}

export const DEFAULT_PLAY_CONFIG: PlayConfig = {
  servers: [],
  groups: [],
  mainLoopMinIntervalMs: 15_000,
  mainLoopIdleIntervalMs: 60_000,
  toolPermission: "admin",
  behaviorTickIntervalMs: 200,
  gameChatHistoryLines: 40,
  qqHistoryLines: 20,
  maxPlayBudgetWarnRatio: 0.85,
  goodbyeTimeoutMs: 8_000,
  qqSendPerMinute: 3,
  gameChatMinIntervalMs: 1_500,
  debug: { enabled: false },
};

export interface BehaviorSpec {
  behavior: string;
  params: Record<string, string>;
}

export type MainLoopTrigger =
  | "game_chat"
  | "idle_timer"
  | "damage"
  | "low_health"
  | "respawn"
  | "player_near"
  | "budget_warn";

export interface PlaySessionStatus {
  serverId: string;
  serverName: string;
  groupId: number;
  botSelfId: number;
  startedAt: number;
  connected: boolean;
  currentBehavior: string | null;
  lastAction: string | null;
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => String(v ?? "").trim())
    .filter((v) => v.length > 0);
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
    ? raw.groups
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
    mainLoopMinIntervalMs: asPositiveNumber(
      raw?.mainLoopMinIntervalMs,
      DEFAULT_PLAY_CONFIG.mainLoopMinIntervalMs,
    ),
    mainLoopIdleIntervalMs: asPositiveNumber(
      raw?.mainLoopIdleIntervalMs,
      DEFAULT_PLAY_CONFIG.mainLoopIdleIntervalMs,
    ),
    toolPermission: perm,
    behaviorTickIntervalMs: asPositiveNumber(
      raw?.behaviorTickIntervalMs,
      DEFAULT_PLAY_CONFIG.behaviorTickIntervalMs,
    ),
    gameChatHistoryLines: asPositiveNumber(
      raw?.gameChatHistoryLines,
      DEFAULT_PLAY_CONFIG.gameChatHistoryLines,
    ),
    qqHistoryLines: asPositiveNumber(
      raw?.qqHistoryLines,
      DEFAULT_PLAY_CONFIG.qqHistoryLines,
    ),
    maxPlayBudgetWarnRatio: asPositiveNumber(
      raw?.maxPlayBudgetWarnRatio,
      DEFAULT_PLAY_CONFIG.maxPlayBudgetWarnRatio,
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
