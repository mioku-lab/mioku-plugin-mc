import type { CooldownRegistry } from "./cooldowns";
import type { MemoryBus } from "./memory-bus";
import type { MissionOutcome, MissionState, ModeState } from "./mode";
import type { Behavior, BehaviorContext } from "../behavior/base-behavior";
import type { BehaviorEngine, BehaviorStateInfo } from "../behavior/engine";
import {
  entityDistance,
  entityName,
  isHostileEntity,
  isPassiveMob,
} from "../util/entities";
import { SectionRevisionTracker } from "../ai/context-builder";

export interface ItemSnapshot {
  slot: number | null;
  name: string;
  count: number;
  durability?: { used: number; max: number; remaining: number; ratio: number };
}

export interface EntitySnapshot {
  id: number;
  name: string;
  kind: "player" | "hostile" | "passive" | "item" | "other";
  username?: string;
  distance: number;
  position: { x: number; y: number; z: number };
}

export interface BehaviorSnapshot {
  seq: number;
  takenAt: number;
  revisions: Record<string, number>;
  self: {
    username: string;
    health: number;
    food: number;
    saturation: number;
    oxygen: number;
    onGround: boolean;
    velocity: { x: number; y: number; z: number } | null;
    gameMode: string;
    experience: unknown;
  };
  vitals: { health: number; food: number; oxygen: number };
  position: { x: number; y: number; z: number } | null;
  dimension: string;
  heldItem: ItemSnapshot | null;
  inventory: {
    items: ItemSnapshot[];
    emptySlots: number;
    full: boolean;
  };
  equipment: {
    hand: ItemSnapshot | null;
    offHand: ItemSnapshot | null;
    head: ItemSnapshot | null;
    torso: ItemSnapshot | null;
    legs: ItemSnapshot | null;
    feet: ItemSnapshot | null;
  };
  entities: EntitySnapshot[];
  environment: {
    timeOfDay: number;
    isDay: boolean;
    weather: "clear" | "rain" | "thunder";
    biome: string | null;
    terrain: {
      below: string | null;
      feet: string | null;
      head: string | null;
      nearbyInteresting: Array<{
        name: string;
        distance: number;
        position: { x: number; y: number; z: number };
      }>;
    };
  };
  sensor: {
    nearestHostile: unknown;
    nearestPlayer: unknown;
    nearestCreeper: unknown;
    nearestPassiveMob: unknown;
    nearbyHostileNames: string[];
    nearbyPlayerNames: string[];
  };
  mode: ModeState;
  mission: { current: MissionState | null; lastOutcome: MissionOutcome | null };
  activeBehaviors: Array<
    BehaviorStateInfo & { internalState: Record<string, unknown> }
  >;
  cooldowns: Record<string, number>;
}

export type WorldSnapshot = BehaviorSnapshot;

export interface SnapshotCollectorOptions {
  bus: MemoryBus;
  engine: BehaviorEngine;
  cooldowns: CooldownRegistry;
  getContext: () => BehaviorContext | null;
  getMission?: () => MissionState | null;
  getLastOutcome?: () => MissionOutcome | null;
}

export class SnapshotCollector {
  private seq = 0;
  private readonly revisions = new SectionRevisionTracker();

  constructor(private readonly opts: SnapshotCollectorOptions) {}

  collect(): BehaviorSnapshot | null {
    const ctx = this.opts.getContext();
    if (!ctx) return null;
    const bot: any = ctx.bot;
    const states = this.opts.engine.getStates(ctx);
    const all = this.opts.engine.getAllBehaviors();
    const position = toPosition(bot.entity?.position);
    const inventoryItems = collectInventory(bot);
    const equipment = collectEquipment(bot);
    const entities = collectEntities(bot);
    const environment = collectEnvironment(bot);
    const vitals = {
      health: Number(bot.health ?? 0),
      food: Number(bot.food ?? 0),
      oxygen: Number(bot.oxygenLevel ?? 0),
    };
    const self = {
      username: String(bot.username ?? "unknown"),
      health: vitals.health,
      food: vitals.food,
      saturation: Number(bot.foodSaturation ?? 0),
      oxygen: vitals.oxygen,
      onGround: Boolean(bot.entity?.onGround),
      velocity: toPosition(bot.entity?.velocity),
      gameMode: String(bot.game?.gameMode ?? "unknown"),
      experience: bot.experience ?? null,
    };
    const mission = {
      current: this.opts.getMission?.() ?? null,
      lastOutcome: this.opts.getLastOutcome?.() ?? null,
    };
    const inventory = {
      items: inventoryItems,
      emptySlots: getEmptySlots(bot),
      full: getEmptySlots(bot) === 0,
    };
    const revisionValues = {
      self,
      inventory,
      equipment,
      entities,
      environment,
      mission,
    };
    const revisions = Object.fromEntries(
      Object.entries(revisionValues).map(([key, value]) => [
        key,
        this.revisions.revision(key, value),
      ]),
    );

    return {
      seq: ++this.seq,
      takenAt: Date.now(),
      revisions,
      self,
      vitals,
      position,
      dimension: String(bot.game?.dimension ?? "overworld"),
      heldItem: itemSnapshot(bot, bot.heldItem, bot.heldItem?.slot ?? null),
      inventory,
      equipment,
      entities,
      environment,
      sensor: {
        nearestHostile: this.opts.bus.get("nearestHostile") ?? null,
        nearestPlayer: this.opts.bus.get("nearestPlayer") ?? null,
        nearestCreeper: this.opts.bus.get("nearestCreeper") ?? null,
        nearestPassiveMob: this.opts.bus.get("nearestPassiveMob") ?? null,
        nearbyHostileNames: this.opts.bus.get("nearbyHostileNames") ?? [],
        nearbyPlayerNames: this.opts.bus.get("nearbyPlayerNames") ?? [],
      },
      mode: this.opts.engine.modeState(),
      mission,
      activeBehaviors: states.map((state) => ({
        ...state,
        internalState: this.contributesFor(all, state.name, ctx),
      })),
      cooldowns: this.opts.cooldowns.snapshot(),
    };
  }

  private contributesFor(
    all: Behavior[],
    name: string,
    ctx: BehaviorContext,
  ): Record<string, unknown> {
    const behavior = all.find((candidate) => candidate.name === name);
    if (!behavior) return {};
    try {
      return behavior.contributesState(ctx) ?? {};
    } catch {
      return {};
    }
  }
}

function collectInventory(bot: any): ItemSnapshot[] {
  const slots: any[] = bot.inventory?.slots ?? [];
  return slots
    .map((item, slot) => itemSnapshot(bot, item, slot))
    .filter((item): item is ItemSnapshot => item !== null)
    .sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
}

function collectEquipment(bot: any): BehaviorSnapshot["equipment"] {
  return {
    hand: itemSnapshot(bot, bot.heldItem, bot.heldItem?.slot ?? null),
    offHand: equipmentAt(bot, "off-hand"),
    head: equipmentAt(bot, "head"),
    torso: equipmentAt(bot, "torso"),
    legs: equipmentAt(bot, "legs"),
    feet: equipmentAt(bot, "feet"),
  };
}

function equipmentAt(bot: any, destination: string): ItemSnapshot | null {
  try {
    const slot = bot.getEquipmentDestSlot?.(destination);
    return slot == null
      ? null
      : itemSnapshot(bot, bot.inventory?.slots?.[slot], slot);
  } catch {
    return null;
  }
}

function itemSnapshot(
  bot: any,
  item: any,
  slot: number | null,
): ItemSnapshot | null {
  if (!item) return null;
  const max = Number(bot.registry?.items?.[item.type]?.maxDurability ?? 0);
  const used = Number(item.durabilityUsed ?? 0);
  return {
    slot,
    name: String(item.name ?? "unknown").replace(/^minecraft:/, ""),
    count: Number(item.count ?? 1),
    ...(max > 0
      ? {
          durability: {
            used,
            max,
            remaining: Math.max(0, max - used),
            ratio: Math.max(0, max - used) / max,
          },
        }
      : {}),
  };
}

function collectEntities(bot: any): EntitySnapshot[] {
  const source = Object.values(bot.entities ?? {}) as any[];
  return source
    .filter((entity) => entity && entity !== bot.entity && entity.position)
    .map((entity) => {
      const distance = entityDistance(bot.entity, entity);
      const name = entityName(entity);
      const playerEntry = Object.entries(bot.players ?? {}).find(
        ([, value]: any) => value?.entity?.id === entity.id,
      );
      const kind: EntitySnapshot["kind"] = playerEntry
        ? "player"
        : isHostileEntity(entity)
          ? "hostile"
          : isPassiveMob(entity)
            ? "passive"
            : name === "item"
              ? "item"
              : "other";
      return {
        id: Number(entity.id),
        name,
        kind,
        username: playerEntry?.[0],
        distance: Math.round(distance * 10) / 10,
        position: toPosition(entity.position)!,
      };
    })
    .filter((entity) => entity.distance <= 24)
    .sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name))
    .slice(0, 32);
}

function collectEnvironment(bot: any): BehaviorSnapshot["environment"] {
  const position = bot.entity?.position;
  const block = (dy: number) =>
    position ? bot.blockAt(position.offset(0, dy, 0), false) : null;
  const biome = position
    ? (bot.blockAt(position, false)?.biome?.name ?? null)
    : null;
  return {
    timeOfDay: Number(bot.time?.timeOfDay ?? 0),
    isDay: Boolean(bot.time?.isDay ?? true),
    weather:
      bot.thunderState > 0 ? "thunder" : bot.isRaining ? "rain" : "clear",
    biome,
    terrain: {
      below: block(-1)?.name ?? null,
      feet: block(0)?.name ?? null,
      head: block(1)?.name ?? null,
      nearbyInteresting: collectInterestingBlocks(bot),
    },
  };
}

function collectInterestingBlocks(
  bot: any,
): BehaviorSnapshot["environment"]["terrain"]["nearbyInteresting"] {
  const origin = bot.entity?.position;
  if (!origin || typeof bot.findBlocks !== "function") return [];
  const interesting =
    /(_ore$|_log$|crafting_table|furnace|chest|barrel|_bed$|water|lava|fire)/;
  try {
    const positions = bot.findBlocks({
      matching: (block: any) => !!block && interesting.test(String(block.name)),
      maxDistance: 16,
      count: 48,
    });
    return positions
      .map((position: any) => {
        const block = bot.blockAt(position, false);
        return {
          name: String(block?.name ?? "unknown"),
          distance: Math.round(origin.distanceTo(position) * 10) / 10,
          position: toPosition(position)!,
        };
      })
      .sort(
        (a: any, b: any) =>
          a.distance - b.distance || a.name.localeCompare(b.name),
      );
  } catch {
    return [];
  }
}

function getEmptySlots(bot: any): number {
  const direct = bot.inventory?.emptySlotCount?.();
  if (Number.isFinite(direct)) return Number(direct);
  const slots = bot.inventory?.slots?.slice(9, 45) ?? [];
  return slots.filter((item: any) => !item).length;
}

function toPosition(value: any): { x: number; y: number; z: number } | null {
  if (!value) return null;
  return { x: Number(value.x), y: Number(value.y), z: Number(value.z) };
}
