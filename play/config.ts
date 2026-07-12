import type { ConfigService } from "mioku";
import {
  DEFAULT_PLAY_CONFIG,
  normalizePlayConfig,
  type GroupBinding,
  type PlayConfig,
  type PlayServerConfig,
} from "./types";

export function createPlayConfigHandler(configService: ConfigService | undefined) {
  let currentConfig: PlayConfig = { ...DEFAULT_PLAY_CONFIG };

  const register = async () => {
    if (!configService) return;
    await configService.registerConfig("mc", "play", DEFAULT_PLAY_CONFIG);
    const raw = await configService.getConfig("mc", "play");
    currentConfig = normalizePlayConfig(raw);
    configService.onConfigChange("mc", "play", (next) => {
      currentConfig = normalizePlayConfig(next);
    });
  };

  const getConfig = () => currentConfig;

  const findServer = (serverId: string): PlayServerConfig | null => {
    const id = String(serverId ?? "").trim();
    return currentConfig.servers.find((s) => s.id === id) ?? null;
  };

  const findBinding = (groupId: number | string): GroupBinding | null => {
    const gid = Number(groupId);
    if (!Number.isFinite(gid) || gid <= 0) return null;
    return currentConfig.groups.find((g) => g.groupId === gid) ?? null;
  };

  return { register, getConfig, findServer, findBinding };
}

export type PlayConfigHandler = ReturnType<typeof createPlayConfigHandler>;
