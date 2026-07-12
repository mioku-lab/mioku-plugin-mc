import { getPluginRuntimeState, setPluginRuntimeState } from "mioku";
import type { PlayManager } from "./index";

export interface McPlayRuntimeState {
  playManager?: PlayManager;
}

export function getMcPlayState(): McPlayRuntimeState {
  return getPluginRuntimeState("mc") as McPlayRuntimeState;
}

export function setMcPlayState(state: McPlayRuntimeState): void {
  setPluginRuntimeState("mc", state);
}
