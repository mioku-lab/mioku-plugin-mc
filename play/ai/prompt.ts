import type { PlayServerConfig } from "../types";
import type { BehaviorSnapshot } from "../state/snapshot";

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

export interface MainPromptInput {
  persona: string;
  serverName: string;
  username: string;
  groupId: number;
  gameLines: string[];
  qqLines: string[];
  snapshot: BehaviorSnapshot;
  trigger: string;
  budgetWarn: boolean;
  elapsedMs: number;
  maxMs: number;
}

export interface WorkPromptInput {
  action: string;
  snapshot: BehaviorSnapshot;
  lastBundle: string | null;
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}m${s.toString().padStart(2, "0")}s`;
}

function formatPosition(snap: BehaviorSnapshot): string {
  const p = snap.position;
  if (!p) return "unknown";
  return `${Math.floor(p.x)},${Math.floor(p.y)},${Math.floor(p.z)}`;
}

function describeBundle(snap: BehaviorSnapshot): string {
  const active = snap.activeBehaviors
    .filter((b) => b.active && (b.category === "movement" || b.category === "combat"))
    .map((b) => b.name);
  if (active.length === 0) return "idle";
  return active.join("+");
}

function heldItemName(snap: BehaviorSnapshot): string {
  return snap.heldItem?.name ?? "empty";
}

export function buildMainPrompt(input: MainPromptInput): string {
  const { snapshot, persona } = input;
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
    `mode=${snapshot.mode.current} active=${describeBundle(snap(snapshot))}`,
    `health=${snapshot.vitals.health}/20 food=${snapshot.vitals.food}/20 oxygen=${snapshot.vitals.oxygen}/20`,
    `position=${formatPosition(snapshot)} dimension=${snapshot.dimension}`,
    `held=${heldItemName(snapshot)}`,
    `nearby_hostiles=[${snapshot.sensor.nearbyHostileNames.join(", ")}] nearby_players=[${snapshot.sensor.nearbyPlayerNames.join(", ")}]`,
    `cooldowns=${Object.keys(snapshot.cooldowns).length} pending`,
    `elapsed=${formatDuration(input.elapsedMs)} / max=${formatDuration(input.maxMs)}` +
      (input.budgetWarn ? "  (time almost up - wrap up, say goodbye in chat, then [exit])" : ""),
    "",
    "## Output Format (STRICT)",
    "- Plain text lines -> sent to in-game chat, one per line. Keep them short and in-character.",
    "- [action:<natural language>] -> hands control to the work model. ONE active action at a time;",
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

function snap(s: BehaviorSnapshot): BehaviorSnapshot {
  return s;
}

export function buildWorkPrompt(input: WorkPromptInput): string {
  const { snapshot, action, lastBundle } = input;
  return [
    "You translate a high-level intent into ONE task bundle for a Minecraft bot.",
    "Available bundles (use JSON; combat/eating are handled automatically as overlays):",
    '- {"bundle":"task.idle_wander"}                                  (default fallback)',
    '- {"bundle":"task.follow_player","params":{"target":"<name>","distance":<blocks>}}',
    '- {"bundle":"task.gather_resource","params":{"resource":"wood|stone|coal|iron"}}',
    '- {"bundle":"task.farm_mobs"}                                    (hunt passive mobs)',
    '- {"bundle":"task.explore"}                                      (wander to load chunks)',
    "",
    "Notes: 'defend' and 'auto_eat' are always-on overlays and are NOT bundles.",
    "To follow a player AND fight, just use task.follow_player; combat activates automatically.",
    "",
    `Environment: mode=${snapshot.mode.current} active=${describeBundle(snapshot)}`,
    `health=${snapshot.vitals.health}/20 food=${snapshot.vitals.food}/20 position=${formatPosition(snapshot)}`,
    `nearby_hostiles=[${snapshot.sensor.nearbyHostileNames.join(", ")}] nearby_players=[${snapshot.sensor.nearbyPlayerNames.join(", ")}]`,
    `held=${heldItemName(snapshot)}`,
    `Previous bundle: ${lastBundle ?? "none"}`,
    `Intent: "${action}"`,
    "",
    'Reply with exactly ONE JSON object on a single line, e.g. {"bundle":"task.follow_player","params":{"target":"Steve","distance":3}}.',
    'If the intent is unclear, reply: {"bundle":"task.idle_wander"}.',
  ].join("\n");
}
