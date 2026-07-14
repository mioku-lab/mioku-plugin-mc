export type BehaviorMode = "EMERGENCY" | "MISSION" | "IDLE";

export interface MissionState {
  missionId: string;
  bundleId: string;
  params: Record<string, unknown>;
  startedAt: number;
  progress: unknown;
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
