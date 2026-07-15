import type { Bot } from "mineflayer";

const FOOD_NAMES = new Set([
  "bread", "apple", "golden_apple", "enchanted_golden_apple", "cooked_beef", "beef",
  "cooked_porkchop", "porkchop", "cooked_chicken", "chicken", "cooked_mutton", "mutton",
  "cooked_cod", "cod", "cooked_salmon", "salmon", "cooked_rabbit", "rabbit",
  "baked_potato", "potato", "carrot", "beetroot", "beetroot_soup", "mushroom_stew",
  "cookie", "melon_slice", "sweet_berries", "glow_berries", "dried_kelp",
  "pumpkin_pie", "honey_bottle", "chorus_fruit",
]);

export function isFood(name: string): boolean {
  return FOOD_NAMES.has(name);
}

export function findFood(bot: Bot): any | null {
  const items = bot.inventory?.items?.() ?? [];
  return items.find((i: any) => isFood(i.name)) ?? null;
}

export async function equipSword(bot: Bot): Promise<void> {
  const items = bot.inventory?.items?.() ?? [];
  const sword = items.find((i: any) => /sword$/.test(i.name));
  if (sword) {
    try {
      await bot.equip(sword as any, "hand");
    } catch {
      // ignore
    }
  }
}

export async function equipToolFor(bot: Bot, resource: string): Promise<boolean> {
  const items = bot.inventory?.items?.() ?? [];
  let tool: any;
  if (resource === "wood") {
    tool = items.find((i: any) => /_axe$/.test(i.name) && !/pickaxe/.test(i.name));
  } else {
    tool = items.find((i: any) => /_pickaxe$/.test(i.name));
  }
  if (tool) {
    try {
      await bot.equip(tool, "hand");
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export async function eatFood(bot: Bot): Promise<boolean> {
  const food = findFood(bot);
  if (!food) return false;
  try {
    await bot.equip(food, "hand");
    await bot.consume();
    return true;
  } catch {
    return false;
  }
}

export function hasShield(bot: Bot): boolean {
  try {
    const anyBot = bot as any;
    if (anyBot.supportFeature?.("doesntHaveOffHandSlot")) return false;
    const dest = anyBot.getEquipmentDestSlot?.("off-hand");
    if (dest == null) return false;
    const slot = bot.inventory?.slots?.[dest];
    return !!slot && /shield/.test(String(slot.name));
  } catch {
    return false;
  }
}
