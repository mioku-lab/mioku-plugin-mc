import type { BotStatus } from "../ai/prompt";
import { listNearbyHostiles, listNearbyPlayers } from "./entities";

export function buildBotStatus(
  bot: any,
  currentBehavior: string | null,
  elapsedMs: number,
  maxMs: number,
): BotStatus | null {
  if (!bot) return null;
  const pos = bot.entity?.position;
  return {
    health: bot.health ?? 20,
    food: bot.food ?? 20,
    position: pos
      ? `${Math.floor(pos.x)},${Math.floor(pos.y)},${Math.floor(pos.z)}`
      : "unknown",
    dimension: bot.game?.dimension ?? "overworld",
    heldItem: bot.heldItem?.name ?? "empty",
    nearbyHostiles: listNearbyHostiles(bot),
    nearbyPlayers: listNearbyPlayers(bot),
    currentBehavior,
    elapsedMs,
    maxMs,
  };
}
