import type { Bot } from "mineflayer";
import type { MemoryBus } from "../memory-bus";
import {
  listNearbyHostiles,
  nearestCreeper,
  nearestHostile,
  nearestPassiveMob,
} from "../../util/entities";

export interface EntityRef {
  id: number;
  name: string;
  position: { x: number; y: number; z: number };
  distance: number;
}

export interface PlayerRef {
  username: string;
  position: { x: number; y: number; z: number };
  distance: number;
}

export interface EntityScannerOptions {
  bus: MemoryBus;
  bot: () => Bot | null;
  intervalMs?: number;
  hostileRadius?: number;
  playerRadius?: number;
  passiveRadius?: number;
  creeperRadius?: number;
}

function toEntityRef(entity: any, distance: number): EntityRef {
  const pos = entity.position;
  return {
    id: entity.id,
    name: String(entity.name ?? entity.entityType ?? "unknown")
      .toLowerCase()
      .replace(/^minecraft:/, ""),
    position: pos
      ? {
          x: pos.x,
          y: pos.y,
          z: pos.z,
        }
      : { x: 0, y: 0, z: 0 },
    distance,
  };
}

function toPlayerRef(
  username: string,
  entity: any,
  distance: number,
): PlayerRef {
  const pos = entity?.position;
  return {
    username,
    position: pos
      ? { x: pos.x, y: pos.y, z: pos.z }
      : { x: 0, y: 0, z: 0 },
    distance,
  };
}

function distanceTo(myPos: any, other: any): number {
  if (!other?.position) return Infinity;
  return Math.hypot(
    other.position.x - myPos.x,
    other.position.y - myPos.y,
    other.position.z - myPos.z,
  );
}

export class EntityScanner {
  private readonly bus: MemoryBus;
  private readonly bot: () => Bot | null;
  private readonly intervalMs: number;
  private readonly hostileRadius: number;
  private readonly playerRadius: number;
  private readonly passiveRadius: number;
  private readonly creeperRadius: number;
  private timer?: NodeJS.Timeout;

  constructor(opts: EntityScannerOptions) {
    this.bus = opts.bus;
    this.bot = opts.bot;
    this.intervalMs = opts.intervalMs ?? 500;
    this.hostileRadius = opts.hostileRadius ?? 16;
    this.playerRadius = opts.playerRadius ?? 16;
    this.passiveRadius = opts.passiveRadius ?? 20;
    this.creeperRadius = opts.creeperRadius ?? 6;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.refresh(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  refresh(): void {
    const bot = this.bot();
    if (!bot?.entity?.position) return;
    const myPos = bot.entity.position;

    const hostile = nearestHostile(bot, this.hostileRadius);
    const passive = nearestPassiveMob(bot, this.passiveRadius);
    const creeper = nearestCreeper(bot, this.creeperRadius);
    const hostileNames = listNearbyHostiles(bot, this.hostileRadius);

    const hostileRef = hostile ? toEntityRef(hostile, distanceTo(myPos, hostile)) : null;
    const passiveRef = passive ? toEntityRef(passive, distanceTo(myPos, passive)) : null;
    const creeperRef = creeper ? toEntityRef(creeper, distanceTo(myPos, creeper)) : null;

    const { nearestPlayer, playerNames } = this.scanPlayers(bot, myPos);

    this.bus.update((m) => {
      m.set("nearestHostile", hostileRef, { ttlMs: 600 });
      m.set("nearestPassiveMob", passiveRef, { ttlMs: 1000 });
      m.set("nearestCreeper", creeperRef, { ttlMs: 400 });
      m.set("nearestPlayer", nearestPlayer, { ttlMs: 600 });
      m.set("nearbyHostileNames", hostileNames, { ttlMs: 600 });
      m.set("nearbyPlayerNames", playerNames, { ttlMs: 600 });
      m.set("vitals", {
        health: bot.health ?? 20,
        food: bot.food ?? 20,
        oxygen: bot.oxygenLevel ?? 20,
      }, { ttlMs: 1000 });
      m.set("dimension", bot.game?.dimension ?? "overworld", { ttlMs: 5000 });
      m.set("position", { x: myPos.x, y: myPos.y, z: myPos.z }, { ttlMs: 1000 });
    });
  }

  private scanPlayers(
    bot: any,
    myPos: any,
  ): { nearestPlayer: PlayerRef | null; playerNames: string[] } {
    const names: string[] = [];
    let nearest: { ref: PlayerRef; dist: number } | null = null;
    const players: any = bot.players ?? {};
    for (const username in players) {
      if (username === bot.username) continue;
      const entry = players[username];
      const entity = entry?.entity;
      if (!entity?.position) continue;
      const dist = distanceTo(myPos, entity);
      if (dist > this.playerRadius) continue;
      names.push(username);
      if (!nearest || dist < nearest.dist) {
        nearest = { ref: toPlayerRef(username, entity, dist), dist };
      }
    }
    names.sort();
    return { nearestPlayer: nearest?.ref ?? null, playerNames: names };
  }
}
