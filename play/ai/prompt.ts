import type { ActionOutcome } from "../actions/registry";
import type { PlayEvent } from "../state/event-journal";
import type { BehaviorSnapshot } from "../state/snapshot";
import type { MainDirective, PlayServerConfig } from "../types";
import { stableStringify } from "./context-builder";

export function buildGoodbyePrompt(
  persona: string,
  server: PlayServerConfig,
): string {
  const lines: string[] = [];
  if (persona) lines.push("## Persona", persona, "");
  lines.push(
    "## Task",
    `You are leaving the Minecraft server \"${server.name}\" right now.`,
    "Say a short in-character goodbye to the players in the server chat.",
    "1 or 2 short lines. No markers, no quotes, no preamble.",
    "Output ONLY the goodbye text.",
  );
  return lines.join("\n");
}

export function buildMainSystemPrompt(persona: string): string {
  return [
    "You are the social/main agent for a Minecraft bot.",
    "Your only responsibilities are understanding in-game conversation, speaking in game, and assigning a high-level goal to the working agent.",
    "QQ chat is read-only background context. Never answer QQ, never relay a message to QQ, and never claim that you did.",
    "Do not control movement, inventory, combat, or blocks directly.",
    "Use submit_main_decision exactly once. Keep game messages short and natural. Use an empty gameMessages array when silence is better.",
    "Only create a directive when a player request or the current conversation actually requires gameplay work.",
    "All current server facts and changing state are provided in user messages and may override stale assumptions.",
    persona
      ? `Persona:\n${persona}`
      : "Persona: act friendly, concise, and human-like.",
  ].join("\n\n");
}

export function buildWorkSystemPrompt(input: {
  bundles: unknown;
  actions: unknown;
}): string {
  return [
    "You are the event-driven working agent for a Minecraft bot.",
    "The deterministic behavior layer performs pathfinding, following, gathering, fighting, eating, and emergency survival. You only choose one high-level state or one atomic action.",
    "Never micromanage coordinates, block placement, camera movement, attack timing, or inventory slots.",
    "Do not invent work when there is no active main directive. Environmental events may justify a temporary protective state such as seeking shelter; otherwise wait.",
    "A main directive has priority, but survival may interrupt it. Failed or blocked mission results must be handled using their structured error code.",
    "Stable mission error codes include target_not_found, target_lost, resource_not_found, missing_item, missing_tool, inventory_full, path_unreachable, path_timeout, permission_denied, command_rejected, disconnected, cancelled, and unknown.",
    "Use submit_work_decision exactly once. Select start_state, perform_action, stop, wait, or request_main.",
    "Set completesDirectiveOnSuccess=false only when the selected step is part of a larger directive and another working decision will be needed after it succeeds.",
    `Available states:\n${stableStringify(input.bundles)}`,
    `Available atomic actions:\n${stableStringify(input.actions)}`,
  ].join("\n\n");
}

export function buildSessionFacts(input: {
  serverName: string;
  username: string;
  groupId: number;
  maxPlayMs: number;
  allowedCommands: string[];
}): string {
  return `SESSION_FACTS\n${stableStringify(input)}`;
}

export function buildMainUserContext(input: {
  trigger: string;
  events: PlayEvent[];
  snapshot: BehaviorSnapshot;
  directive: MainDirective | null;
  elapsedMs: number;
  maxMs: number;
}): string {
  const snapshot = input.snapshot;
  return `CURRENT_MAIN_CONTEXT\n${stableStringify({
    trigger: input.trigger,
    elapsedMs: input.elapsedMs,
    maxMs: input.maxMs,
    events: input.events,
    directive: input.directive,
    status: {
      health: snapshot.vitals.health,
      food: snapshot.vitals.food,
      oxygen: snapshot.vitals.oxygen,
      position: snapshot.position,
      dimension: snapshot.dimension,
      equipment: snapshot.equipment,
      nearbyPlayers: snapshot.entities.filter(
        (entity) => entity.kind === "player",
      ),
      nearbyHostiles: snapshot.entities
        .filter((entity) => entity.kind === "hostile")
        .slice(0, 8),
      environment: {
        timeOfDay: snapshot.environment.timeOfDay,
        isDay: snapshot.environment.isDay,
        weather: snapshot.environment.weather,
        biome: snapshot.environment.biome,
        terrain: {
          below: snapshot.environment.terrain.below,
          feet: snapshot.environment.terrain.feet,
          head: snapshot.environment.terrain.head,
          nearbyInteresting:
            snapshot.environment.terrain.nearbyInteresting.slice(0, 12),
        },
      },
      mission: snapshot.mission,
      activeBehaviors: snapshot.activeBehaviors.filter(
        (behavior) => behavior.active,
      ),
    },
  })}`;
}

export function buildWorkUserContext(input: {
  triggerEvents: PlayEvent[];
  snapshot: BehaviorSnapshot;
  directive: MainDirective | null;
  lastActionOutcome: ActionOutcome | null;
}): string {
  return `CURRENT_WORK_CONTEXT\n${stableStringify({
    triggerEvents: input.triggerEvents,
    directive: input.directive,
    lastActionOutcome: input.lastActionOutcome,
    world: input.snapshot,
  })}`;
}
