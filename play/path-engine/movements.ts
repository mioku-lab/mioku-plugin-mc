import type { Bot } from "mineflayer";

export interface MovementsConfig {
  canDig: boolean;
  allowParkour: boolean;
  allowSprinting: boolean;
  allow1by1towers: boolean;
  maxDropDown: number;
}

export const DEFAULT_MOVEMENTS: MovementsConfig = {
  canDig: true,
  allowParkour: true,
  allowSprinting: true,
  allow1by1towers: true,
  maxDropDown: 4,
};

export interface BlockInfo {
  name: string;
  type: number;
  boundingBox: "block" | "empty";
  diggable: boolean;
  hardness: number;
  physical: boolean;
}

export function getBlock(bot: Bot, x: number, y: number, z: number): BlockInfo | null {
  try {
    const block = bot.blockAt(
      { x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) } as any,
      false,
    ) as any;
    if (!block) return null;
    return {
      name: String(block.name ?? ""),
      type: block.type ?? 0,
      boundingBox: block.boundingBox === "block" ? "block" : "empty",
      diggable: !!block.diggable,
      hardness: block.hardness ?? 0,
      physical: !!block.physical,
    };
  } catch {
    return null;
  }
}

export function isSolid(b: BlockInfo | null): boolean {
  return !!b && b.boundingBox === "block";
}

export function isAir(b: BlockInfo | null): boolean {
  return !b || b.boundingBox === "empty";
}