import type { ActionOutcome } from "../actions/registry";
import type { PlayEvent } from "../state/event-journal";
import type { BehaviorSnapshot } from "../state/snapshot";
import type { PlayServerConfig, WorkStatus } from "../types";
import { stableStringify } from "./context-builder";
import type { WorkTerminator } from "./work-subroutine";

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

export interface MainPromptContext {
  persona: string;
  bundles: unknown;
  actions: unknown;
  workStatus: WorkStatus | null;
  focusedUntil: number;
}

export function buildMainSystemPrompt(input: MainPromptContext): string {
  return [
    "You are the only AI for a Minecraft bot that is currently in-game.",
    "You see the bot's vitals, inventory, equipment, nearby entities, world state, recent chat, and (if running) the work subroutine's status.",
    "",
    "## Your output IS the chat reply",
    "- Your plain-text response will be split by newlines and sent to the in-game chat, one line per newline.",
    "- Keep total text short (max 3 short lines, each <=256 chars).",
    "- Empty text is fine when silence is the right answer.",
    "- DO NOT output JSON, tool-call syntax, or anything else. Just natural language chat lines.",
    "",
    "## How to act",
    "- You have tools. Each tool call is one action. The bot executes tools synchronously — you wait for completion before your next move.",
    "- For multi-step autonomous tasks (e.g. gather 16 oak logs, follow player X for 2 minutes), use `delegate_work` so the work agent runs the sub-task and returns a status.",
    "- For short or immediate actions, call `start_motion`, `perform_action`, or `stop_motion` directly.",
    "- Use `leave_server` only when the player asks to leave or the session must end.",
    "",
    "## Focus rules",
    "- If a player asked you to do something, STAY ON THAT TASK. Do not switch to a different topic just because new chat arrived.",
    "- You are NOT interrupted by in-game events (damage, hostile mobs, equipment loss). Your behavior engine handles survival automatically; you keep planning.",
    "- If a new message explicitly @-mentions the bot while you are in the middle of a tool chain, your MainLoop will queue it; you will see and respond to it in your NEXT turn, after the current tool completes.",
    "- Don't repeat yourself. Don't echo the player's message. Don't narrate actions in asterisks.",
    "",
    "## Chat scan context",
    "- When you are triggered by `chat_scan_due` (every few minutes), review the recent chat lines. Reply ONLY if there's something that actually needs a response (someone asked you a question, or said something noteworthy). Otherwise output empty text and end your turn.",
    "",
    "## Reading the work status",
    "- When a task is delegated to work, you can see its `summary` and `progress` passively. Use it to answer player questions like \"what are you doing?\" without re-running anything.",
    "- Do NOT call `delegate_work` again while one is already running (`workStatus.running === true`). Either wait, or stop the current one first with `stop_motion`.",
    "",
    `Available motion bundles:\n${stableStringify(input.bundles)}`,
    `Available atomic actions:\n${stableStringify(input.actions)}`,
    "",
    input.persona
      ? `Persona:\n${input.persona}`
      : "Persona: act friendly, concise, and human-like.",
  ].join("\n");
}

export interface WorkPromptContext {
  goal: string;
  terminator: WorkTerminator;
  bundles: unknown;
  actions: unknown;
}

export function buildWorkSystemPrompt(input: WorkPromptContext): string {
  const terminatorDescription = describeTerminator(input.terminator);
  return [
    "You are the work agent for a Minecraft bot, called as a synchronous subroutine by the main agent.",
    "Your single job is to drive the bot until the goal is complete, then return.",
    "",
    "## Your single assignment",
    `Goal: ${input.goal}`,
    `Terminator: ${terminatorDescription}`,
    "",
    "## How to act",
    "- You have tools to start/stop motion bundles, perform atomic actions, and update status.",
    "- Pick ONE next action per turn. Don't try to do multiple things at once.",
    "- Do NOT output chat lines — only tool calls and (optionally) text that updates the status report.",
    "- Call `update_status` only when progress changed meaningfully (e.g. collected 4 logs out of 16). Don't spam status updates.",
    "- When the terminator condition is met (inventory threshold reached, follow duration elapsed, etc.), just stop calling new actions and end your turn — the subroutine will detect completion and return.",
    "",
    "## Failure handling",
    "- If a motion/action outcome is failed or blocked, do NOT silently retry the same thing. Read the structured error code and adapt:",
    "  target_not_found → switch target or search elsewhere",
    "  resource_not_found → wander or give up",
    "  missing_tool → craft a prerequisite first",
    "  inventory_full → drop or deposit",
    "  path_unreachable → try another area",
    "  path_timeout → break line of sight and try again",
    "  permission_denied → stop the goal",
    "  disconnected → wait briefly",
    "",
    "Stable mission error codes include target_not_found, target_lost, resource_not_found, missing_item, missing_tool, inventory_full, path_unreachable, path_timeout, permission_denied, command_rejected, disconnected, cancelled, and unknown.",
    "",
    `Available motion bundles:\n${stableStringify(input.bundles)}`,
    `Available atomic actions:\n${stableStringify(input.actions)}`,
  ].join("\n");
}

function describeTerminator(t: WorkTerminator): string {
  switch (t.type) {
    case "inventory_at_least":
      return `inventory has at least ${t.count} × ${t.item}`;
    case "follow_for":
      return `follow ${t.target} for ${t.ms} ms`;
    case "duration":
      return `run for ${t.ms} ms total`;
    case "manual":
      return "main agent will stop you when done";
  }
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

export interface MainUserContextInput {
  trigger: string;
  events: PlayEvent[];
  snapshot: BehaviorSnapshot;
  workStatus: WorkStatus | null;
  elapsedMs: number;
  maxMs: number;
}

export function buildMainUserContext(input: MainUserContextInput): string {
  const snapshot = input.snapshot;
  return `CURRENT_MAIN_CONTEXT\n${stableStringify({
    trigger: input.trigger,
    elapsedMs: input.elapsedMs,
    maxMs: input.maxMs,
    events: input.events,
    workStatus: input.workStatus,
    status: {
      health: snapshot.vitals.health,
      food: snapshot.vitals.food,
      oxygen: snapshot.vitals.oxygen,
      position: snapshot.position,
      dimension: snapshot.dimension,
      equipment: snapshot.equipment,
      heldItem: snapshot.heldItem,
      inventory: {
        items: snapshot.inventory.items.slice(0, 24),
        emptySlots: snapshot.inventory.emptySlots,
        full: snapshot.inventory.full,
      },
      nearbyPlayers: snapshot.entities
        .filter((entity) => entity.kind === "player")
        .slice(0, 8),
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
      activeBehaviors: snapshot.activeBehaviors.filter((b) => b.active),
    },
  })}`;
}

export interface WorkUserContextInput {
  goal: string;
  terminator: WorkTerminator;
  triggerEvents: PlayEvent[];
  snapshot: BehaviorSnapshot;
  lastActionOutcome: ActionOutcome | null;
}

export function buildWorkUserContext(input: WorkUserContextInput): string {
  return `CURRENT_WORK_CONTEXT\n${stableStringify({
    goal: input.goal,
    terminator: input.terminator,
    triggerEvents: input.triggerEvents,
    lastActionOutcome: input.lastActionOutcome,
    world: input.snapshot,
  })}`;
}