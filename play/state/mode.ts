export type BehaviorMode = "EMERGENCY" | "MISSION" | "IDLE";

export type MissionStatus = "running" | "succeeded" | "failed" | "blocked" | "cancelled";

export type MissionErrorCode =
  | "target_not_found"
  | "target_lost"
  | "resource_not_found"
  | "missing_item"
  | "missing_tool"
  | "inventory_full"
  | "path_unreachable"
  | "path_timeout"
  | "permission_denied"
  | "command_rejected"
  | "disconnected"
  | "cancelled"
  | "unknown";

export interface MissionState {
  missionId: string;
  bundleId: string;
  params: Record<string, unknown>;
  startedAt: number;
  status: "running";
  progress: unknown;
  objective?: string;
  directiveId?: string;
  completesDirectiveOnSuccess: boolean;
}

export interface MissionOutcome {
  missionId: string;
  bundleId: string;
  status: Exclude<MissionStatus, "running">;
  code?: MissionErrorCode;
  detail?: string;
  progress: unknown;
  startedAt: number;
  endedAt: number;
  directiveId?: string;
  completesDirectiveOnSuccess: boolean;
}

export interface ModeSwitch {
  from: BehaviorMode | null;
  to: BehaviorMode;
  reason: string;
  at: number;
}

export interface ModeState {
  current: BehaviorMode;
  mission: MissionState | null;
  lastSwitch: ModeSwitch;
}
