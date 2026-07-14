import type { MemoryBus } from "./memory-bus";
import type { CooldownRegistry } from "./cooldowns";
import type { BehaviorEngine, BehaviorStateInfo } from "../behavior/engine";
import type { BehaviorContext, Behavior } from "../behavior/base-behavior";
import type { ModeState } from "./mode";

export interface BehaviorSnapshot {
  seq: number;
  takenAt: number;
  vitals: { health: number; food: number; oxygen: number };
  position: { x: number; y: number; z: number } | null;
  dimension: string;
  heldItem: { name: string; durability?: number } | null;
  sensor: {
    nearestHostile: unknown;
    nearestPlayer: unknown;
    nearestCreeper: unknown;
    nearestPassiveMob: unknown;
    nearbyHostileNames: string[];
    nearbyPlayerNames: string[];
  };
  mode: ModeState;
  activeBehaviors: Array<BehaviorStateInfo & { internalState: Record<string, unknown> }>;
  cooldowns: Record<string, number>;
}

export interface SnapshotCollectorOptions {
  bus: MemoryBus;
  engine: BehaviorEngine;
  cooldowns: CooldownRegistry;
  getContext: () => BehaviorContext | null;
}

export class SnapshotCollector {
  private seq = 0;

  constructor(private readonly opts: SnapshotCollectorOptions) {}

  collect(): BehaviorSnapshot | null {
    const ctx = this.opts.getContext();
    if (!ctx) return null;
    const states = this.opts.engine.getStates(ctx);
    const all = this.opts.engine.getAllBehaviors();
    const bot = ctx.bot;
    const held = bot?.heldItem
      ? {
          name: String(bot.heldItem.name ?? "unknown")
            .toLowerCase()
            .replace(/^minecraft:/, ""),
          durability: bot.heldItem.metadata ?? undefined,
        }
      : null;

    return {
      seq: ++this.seq,
      takenAt: Date.now(),
      vitals: this.opts.bus.get("vitals") ?? { health: 0, food: 0, oxygen: 0 },
      position: this.opts.bus.get("position") ?? null,
      dimension: this.opts.bus.get("dimension") ?? "overworld",
      heldItem: held,
      sensor: {
        nearestHostile: this.opts.bus.get("nearestHostile") ?? null,
        nearestPlayer: this.opts.bus.get("nearestPlayer") ?? null,
        nearestCreeper: this.opts.bus.get("nearestCreeper") ?? null,
        nearestPassiveMob: this.opts.bus.get("nearestPassiveMob") ?? null,
        nearbyHostileNames: this.opts.bus.get("nearbyHostileNames") ?? [],
        nearbyPlayerNames: this.opts.bus.get("nearbyPlayerNames") ?? [],
      },
      mode: this.opts.engine.modeState(),
      activeBehaviors: states.map((s) => ({
        ...s,
        internalState: this.contributesFor(all, s.name, ctx),
      })),
      cooldowns: this.opts.cooldowns.snapshot(),
    };
  }

  private contributesFor(
    all: Behavior[],
    name: string,
    ctx: BehaviorContext,
  ): Record<string, unknown> {
    const b = all.find((x) => x.name === name);
    if (!b) return {};
    try {
      return b.contributesState(ctx) ?? {};
    } catch {
      return {};
    }
  }
}
