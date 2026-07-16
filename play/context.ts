import type { MiokiContext } from "mioki";
import type { AIService, AIInstance, ConfigService } from "mioku";
import type { PlayConfig } from "./types";
import type { ConfigHandler } from "../utils/config-handler";
import type { WorkSubroutine, WorkTerminator } from "./ai/work-subroutine";
import type { PlaySession } from "./session";

export interface PlayPluginContext {
  ctx: MiokiContext;
  config: PlayConfig;
  aiService: AIService | undefined;
  configService: ConfigService | undefined;
  syncConfigHandler: ConfigHandler;
  mainInstance: AIInstance | undefined;
  workInstance: AIInstance | undefined;
  getPlayConfig: () => PlayConfig;
  refreshInstances: () => void;
  createWorkSubroutine: (opts: {
    session: PlaySession;
    goal: string;
    terminator: WorkTerminator;
    maxMs?: number;
    maxIterations?: number;
  }) => WorkSubroutine;
  notifyChatScan?: () => void;
}