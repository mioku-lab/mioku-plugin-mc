const HOSTILE_MOBS = new Set([
  "zombie", "husk", "drowned", "skeleton", "stray", "creeper", "spider", "cave_spider",
  "enderman", "witch", "blaze", "ghast", "magma_cube", "slime", "phantom", "pillager",
  "vindicator", "evoker", "ravager", "hoglin", "zoglin", "warden", "wither",
  "ender_dragon", "shulker", "silverfish", "guardian", "elder_guardian", "piglin_brute",
  "piglin", "zombified_piglin",
]);

export function entityName(entity: any): string {
  if (!entity) return "unknown";
  const raw = entity.name || entity.entityType || entity.kind || "unknown";
  return String(raw).toLowerCase().replace(/^minecraft:/, "");
}

export function isHostileEntity(entity: any): boolean {
  return HOSTILE_MOBS.has(entityName(entity));
}

export function isPassiveMob(entity: any): boolean {
  const name = entityName(entity);
  const passive = [
    "cow", "pig", "sheep", "chicken", "rabbit", "horse", "donkey", "mule",
    "villager", "iron_golem", "snow_golem", "cat", "ocelot", "wolf", "parrot",
    "fox", "bee", "turtle", "panda", "llama", "trader_llama", "wandering_trader",
    "mooshroom", "goat", "axolotl", "allay", "frog", "tadpole", "sniffer",
  ];
  return passive.includes(name);
}

export function entityDistance(a: any, b: any): number {
  if (!a?.position || !b?.position) return Infinity;
  return Math.hypot(
    a.position.x - b.position.x,
    a.position.y - b.position.y,
    a.position.z - b.position.z,
  );
}

export function listNearbyHostiles(bot: any, radius = 16): string[] {
  const out: string[] = [];
  const pos = bot?.entity?.position;
  if (!pos) return out;
  for (const id in bot.entities) {
    const e = bot.entities[id];
    if (e === bot.entity) continue;
    if (!isHostileEntity(e)) continue;
    const d = entityDistance({ position: pos }, e);
    if (d <= radius) out.push(`${entityName(e)}@${d.toFixed(0)}`);
  }
  return out.slice(0, 8);
}

export function listNearbyPlayers(bot: any, radius = 16): string[] {
  const out: string[] = [];
  const pos = bot?.entity?.position;
  if (!pos) return out;
  for (const name in bot.players) {
    const p = bot.players[name];
    if (!p || name === bot.username) continue;
    const d = entityDistance({ position: pos }, p.entity);
    if (d <= radius) out.push(`${name}@${d.toFixed(0)}`);
  }
  return out.slice(0, 8);
}

export function nearestHostile(bot: any, radius = 16): any | null {
  let best: any = null;
  let bestDist = Infinity;
  const pos = bot?.entity?.position;
  if (!pos) return null;
  for (const id in bot.entities) {
    const e = bot.entities[id];
    if (e === bot.entity || !isHostileEntity(e)) continue;
    const d = entityDistance({ position: pos }, e);
    if (d <= radius && d < bestDist) {
      best = e;
      bestDist = d;
    }
  }
  return best;
}

export function nearestPassiveMob(bot: any, radius = 20): any | null {
  let best: any = null;
  let bestDist = Infinity;
  const pos = bot?.entity?.position;
  if (!pos) return null;
  for (const id in bot.entities) {
    const e = bot.entities[id];
    if (e === bot.entity || !isPassiveMob(e)) continue;
    if (e.name === "player") continue;
    const d = entityDistance({ position: pos }, e);
    if (d <= radius && d < bestDist) {
      best = e;
      bestDist = d;
    }
  }
  return best;
}

export function nearestCreeper(bot: any, radius = 6): any | null {
  let best: any = null;
  let bestDist = Infinity;
  const pos = bot?.entity?.position;
  if (!pos) return null;
  for (const id in bot.entities) {
    const e = bot.entities[id];
    if (entityName(e) !== "creeper") continue;
    const d = entityDistance({ position: pos }, e);
    if (d <= radius && d < bestDist) {
      best = e;
      bestDist = d;
    }
  }
  return best;
}
