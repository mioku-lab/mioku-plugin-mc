import type { PlayServerConfig } from "../types";

export function buildGoodbyePrompt(persona: string, server: PlayServerConfig): string {
  const lines: string[] = [];
  if (persona) {
    lines.push("## Persona", persona, "");
  }
  lines.push(
    "## Task",
    `You are leaving the Minecraft server "${server.name}" right now.`,
    "Say a short in-character goodbye to the players in the server chat.",
    "1 or 2 short lines. No markers, no quotes, no preamble.",
    "Output ONLY the goodbye text.",
  );
  return lines.join("\n");
}

export interface BotStatus {
  health: number;
  food: number;
  position: string;
  dimension: string;
  heldItem: string;
  nearbyHostiles: string[];
  nearbyPlayers: string[];
  currentBehavior: string | null;
  elapsedMs: number;
  maxMs: number;
}

export interface MainPromptInput {
  persona: string;
  serverName: string;
  username: string;
  groupId: number;
  gameLines: string[];
  qqLines: string[];
  status: BotStatus;
  trigger: string;
  budgetWarn: boolean;
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}m${s.toString().padStart(2, "0")}s`;
}

export function buildMainPrompt(input: MainPromptInput): string {
  const { status, persona } = input;
  const lines: string[] = [];

  if (persona) {
    lines.push("## Persona", persona, "");
  }

  lines.push(
    "## You",
    `You are this bot, currently inside the Minecraft server "${input.serverName}" as the player "${input.username}".`,
    `You see two chat channels: the in-game chat and a linked QQ group (${input.groupId}).`,
    "Act in-game; you may relay a short message to the QQ group occasionally.",
    "",
    "## In-Game Chat (most recent lines, oldest first)",
    input.gameLines.length > 0 ? input.gameLines.join("\n") : "(no recent chat)",
    "",
    "## QQ Group (most recent lines)",
    input.qqLines.length > 0 ? input.qqLines.join("\n") : "(no recent messages)",
    "",
    "## Your Status",
    `health=${status.health}/20 food=${status.food}/20 position=${status.position} dimension=${status.dimension}`,
    `held=${status.heldItem} nearby_hostiles=[${status.nearbyHostiles.join(", ")}] nearby_players=[${status.nearbyPlayers.join(", ")}]`,
    `current_behavior=${status.currentBehavior ?? "none"}`,
    `elapsed=${formatDuration(status.elapsedMs)} / max=${formatDuration(status.maxMs)}` +
      (input.budgetWarn ? "  (time almost up - wrap up, say goodbye in chat, then [exit])" : ""),
    "",
    "## Output Format (STRICT)",
    "- Plain text lines -> sent to in-game chat, one per line. Keep them short and in-character.",
    "- [action:<natural language>] -> hands control to the behavior engine. ONE active action at a time;",
    "  it persists until you emit a new [action] or [exit]. Examples:",
    "  [action:stay near Steve and help him fight mobs]",
    "  [action:gather wood for a bit]",
    "  [action:just idle around the spawn area]",
    "- [qq:<message>] -> relay a short message to the linked QQ group (use sparingly, at most one per turn).",
    "- [exit] -> leave the server after saying goodbye in chat.",
    "- NO markdown, NO tools, NO [reply]/[at]/[poke]/[meme] markers - those are QQ-only and not available here.",
    "- Output ONLY your lines and markers. No reasoning, no preamble.",
    "",
    `Trigger for this turn: ${input.trigger}.`,
  );
  return lines.join("\n");
}

export interface WorkPromptInput {
  action: string;
  status: BotStatus;
  lastBehavior: string | null;
}

export function buildWorkPrompt(input: WorkPromptInput): string {
  const { status } = input;
  return [
    "You translate a high-level intent into ONE behavior command for a Minecraft bot.",
    "Available behaviors:",
    "- idle",
    "- follow target=<playerName> distance=<blocks, default 3>",
    "- defend radius=<blocks, default 8>",
    "- follow_assist target=<playerName>     (follow a player and attack threats near them)",
    "- gather resource=<wood|stone|food|coal|iron>",
    "- farm_mobs                             (hunt passive mobs for food/drops)",
    "- guard x=<int> y=<int> z=<int> radius=<blocks>",
    "- socialize                             (approach the nearest player, emote)",
    "- flee                                   (run to a safe point / away from threats)",
    "- explore                                (wander to load new chunks)",
    "",
    `Environment: health=${status.health}/20 food=${status.food}/20 position=${status.position} nearby_hostiles=[${status.nearbyHostiles.join(", ")}] nearby_players=[${status.nearbyPlayers.join(", ")}] held=${status.heldItem}`,
    `Previous behavior: ${input.lastBehavior ?? "none"}`,
    `Intent: "${input.action}"`,
    "",
    "Reply with exactly ONE line: behavior=<name> key=value ...",
    "If the intent is unclear or no change is needed, reply: behavior=idle",
  ].join("\n");
}
