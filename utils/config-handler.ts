import type { ConfigService } from "mioku";
import { DEFAULT_CONFIG, normalizeConfig, type McConfig } from "../types";

export function createConfigHandler(configService: ConfigService | undefined) {
  let currentConfig: McConfig = { ...DEFAULT_CONFIG };

  const register = async () => {
    if (!configService) return;
    await configService.registerConfig("mc", "base", DEFAULT_CONFIG);
    const raw = await configService.getConfig("mc", "base");
    currentConfig = normalizeConfig(raw);
    configService.onConfigChange("mc", "base", (next) => {
      currentConfig = normalizeConfig(next);
    });
  };

  const getConfig = () => currentConfig;

  const updateServerSync = async (serverName: string, enabled: boolean) => {
    if (!configService) return;
    const servers = currentConfig.servers.map((s) =>
      s.server_name === serverName ? { ...s, sync_enabled: enabled } : s,
    );
    await configService.updateConfig("mc", "base", { servers });
  };

  const findServerByName = (serverName: string) => {
    return (
      currentConfig.servers.find((s) => s.server_name === serverName) || null
    );
  };

  const getServersForGroup = (groupId: string | number): typeof currentConfig.servers => {
    const gid = String(groupId);
    return currentConfig.servers.filter((s) => {
      return s.group_list == gid;
    });
  };

  return {
    register,
    getConfig,
    updateServerSync,
    findServerByName,
    getServersForGroup,
  };
}

export type ConfigHandler = ReturnType<typeof createConfigHandler>;