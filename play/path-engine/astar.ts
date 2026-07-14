import type { Bot } from "mineflayer";
import { Vec3 } from "vec3";
import { getBlock, isAir, isSolid, type MovementsConfig } from "./movements";
import type { PathGoal } from "./goals";

export interface AStarNode {
  x: number;
  y: number;
  z: number;
  g: number;
  f: number;
  estimatedCostToGoal: number;
  previous: AStarNode | null;
  jump: boolean;
  toBreak: { x: number; y: number; z: number; stringId?: string }[];
  toPlace: { x: number; y: number; z: number; dx: number; dy: number; dz: number; sneak?: boolean }[];
  ascend?: boolean;
  descend?: boolean;
  parkour?: boolean;
  pillar?: boolean;
  diagonal?: boolean;
  digTime?: number;
}

export type AStarResult =
  | { status: "success"; nodes: AStarNode[] }
  | { status: "noPath"; nodes: AStarNode[] }
  | { status: "partial"; nodes: AStarNode[] }
  | { status: "timeout"; nodes: AStarNode[] };

const COST_INF = 1_000_000;
const MAX_NODES = 1200;
const PARTIAL_MIN_DIST = 4;

const WALK_ONE_BLOCK_COST = 20;
const SPRINT_ONE_BLOCK_COST = 10;
const SNEAK_ONE_BLOCK_COST = 40;
const WALK_OFF_BLOCK_COST = 4;
const CENTER_AFTER_FALL_COST = 5;
const SOUL_SAND_WALK_RATIO = 0.4;
const PLACE_BLOCK_COST = 5;
const JUMP_PENALTY = 10;
const PLACE_BUCKET_COST = 100;
const PARKOUR_JUMP_PENALTY = 15;
const SPRINT_MULTIPLIER = 0.5;
const PARKOUR_MAX_DIST_SPRINT = 4;
const PARKOUR_MAX_DIST_WALK = 3;
const MAX_FALL_NO_WATER = 3;
const MAX_FALL_BUCKET = 11;
const LADDER_DOWN_COST = 5;
const MAX_DROP = 4;

function key(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

function blockAt(bot: Bot, x: number, y: number, z: number): any {
  try {
    return bot.blockAt(new Vec3(x, y, z), false) as any;
  } catch {
    return null;
  }
}

function isPassable(b: any): boolean {
  if (!b) return true;
  return b.boundingBox === "empty" && !b.fluid;
}

function isWalkable(b: any): boolean {
  if (!b) return false;
  if (b.boundingBox !== "block") return false;
  if (b.diggable && b.material === "plant" && b.boundingBox === "empty") return true;
  return true;
}

function isClimbable(b: any): boolean {
  if (!b) return false;
  return b.name === "ladder" || b.name === "vine";
}

function isWater(b: any): boolean {
  return !!b && (b.name === "water" || b.name === "flowing_water");
}

function isLava(b: any): boolean {
  return !!b && (b.name === "lava" || b.name === "flowing_lava");
}

function isLiquid(b: any): boolean {
  return isWater(b) || isLava(b);
}

function isFalling(b: any): boolean {
  if (!b) return false;
  return b.name === "sand" || b.name === "gravel" || b.name === "red_sand";
}

function canPlaceAgainst(bot: Bot, x: number, y: number, z: number): boolean {
  const b = blockAt(bot, x, y, z);
  if (!b) return false;
  if (b.boundingBox === "block" || isClimbable(b)) return true;
  return false;
}

function isReplaceable(b: any): boolean {
  if (!b) return true;
  return b.boundingBox === "empty";
}

function estimateDigSeconds(bot: Bot, x: number, y: number, z: number): number {
  const b = blockAt(bot, x, y, z);
  if (!b) return 0;
  if (isPassable(b)) return 0;
  if (!b.diggable) return COST_INF;
  try {
    const held = (bot.heldItem as any) || null;
    const itemType = held?.type ?? 0;
    const ms = b.digTime(itemType, false, false, false);
    const ticks = Math.max(1, ms / 50);
    return ticks;
  } catch {
    return 20;
  }
}

function chooseBestTool(bot: Bot, block: any): any {
  try {
    const items = bot.inventory?.items?.() ?? [];
    if (items.length === 0) return null;
    let best: any = null;
    let bestSpeed = -1;
    for (const it of items) {
      if (!block.diggable) return null;
      try {
        const ms = block.digTime(it.type, false, false, false);
        if (ms <= 0) continue;
        const speed = 1000 / ms;
        if (speed > bestSpeed) {
          bestSpeed = speed;
          best = it;
        }
      } catch {
        // ignore
      }
    }
    if (best) void bot.equip(best, "hand");
    return best;
  } catch {
    return null;
  }
}

function isAdjacentClear(bot: Bot, x: number, y: number, z: number): boolean {
  return isPassable(blockAt(bot, x, y, z));
}

function safeOvershoot(bot: Bot, x: number, y: number, z: number): boolean {
  const feet = blockAt(bot, x, y, z);
  const head = blockAt(bot, x, y + 1, z);
  const top = blockAt(bot, x, y + 2, z);
  return isPassable(feet) && isPassable(head) && isPassable(top);
}

function tryMoveAscend(
  bot: Bot,
  node: AStarNode,
  dir: { x: number; z: number },
  _m: MovementsConfig,
): AStarNode | null {
  const x = node.x + dir.x;
  const z = node.z + dir.z;
  const y = node.y + 1;
  const dest = blockAt(bot, x, y, z);
  const destUp = blockAt(bot, x, y + 1, z);
  const curHead = blockAt(bot, node.x, node.y + 1, node.z);
  const curUp = blockAt(bot, node.x, node.y + 2, node.z);
  if (!isWalkable(blockAt(bot, x, y - 1, z))) return null;
  if (!isPassable(dest) || !isPassable(destUp)) return null;
  if (!isPassable(curHead) || !isPassable(curUp)) return null;
  const d1 = estimateDigSeconds(bot, x, y + 1, z);
  const d2 = estimateDigSeconds(bot, x, y + 2, z);
  if (d1 >= COST_INF || d2 >= COST_INF) return null;
  return {
    x, y, z,
    g: 0, f: 0, estimatedCostToGoal: 0,
    previous: node,
    jump: true,
    toBreak: [],
    toPlace: [],
    ascend: true,
    digTime: d1 + d2,
  };
}

function tryMoveTraverse(
  bot: Bot,
  node: AStarNode,
  dir: { x: number; z: number },
  _m: MovementsConfig,
): AStarNode | null {
  const x = node.x + dir.x;
  const z = node.z + dir.z;
  const y = node.y;
  const feet = blockAt(bot, x, y, z);
  const head = blockAt(bot, x, y + 1, z);
  const under = blockAt(bot, x, y - 1, z);
  if (!isPassable(feet) || !isPassable(head)) return null;
  if (!isWalkable(under)) {
    return tryBridge(bot, node, dir, under, _m);
  }
  const d1 = estimateDigSeconds(bot, x, y, z);
  const d2 = estimateDigSeconds(bot, x, y + 1, z);
  if (d1 >= COST_INF || d2 >= COST_INF) return null;
  return {
    x, y, z,
    g: 0, f: 0, estimatedCostToGoal: 0,
    previous: node,
    jump: false,
    toBreak: [],
    toPlace: [],
    digTime: d1 + d2,
  };
}

function tryBridge(
  bot: Bot,
  node: AStarNode,
  dir: { x: number; z: number },
  under: any,
  m: MovementsConfig,
): AStarNode | null {
  const x = node.x + dir.x;
  const z = node.z + dir.z;
  const y = node.y;
  if (!isReplaceable(under)) return null;
  if (isClimbable(under)) return null;
  if (!canPlaceAgainst(bot, x, y - 1, z - dir.z) && !canPlaceAgainst(bot, x, y - 1, z + dir.x) && !canPlaceAgainst(bot, x - dir.x, y - 1, z) && !canPlaceAgainst(bot, x + dir.x, y - 1, z) && !canPlaceAgainst(bot, x, y - 2, z)) return null;
  return {
    x, y, z,
    g: 0, f: 0, estimatedCostToGoal: 0,
    previous: node,
    jump: false,
    toBreak: [],
    toPlace: [{ x, y: y - 1, z, dx: 0, dy: 1, dz: 0, sneak: true }],
    digTime: 0,
  };
}

function tryMoveDescend(
  bot: Bot,
  node: AStarNode,
  dir: { x: number; z: number },
  _m: MovementsConfig,
): AStarNode | null {
  const x = node.x + dir.x;
  const z = node.z + dir.z;
  const y = node.y - 1;
  const feet = blockAt(bot, x, y, z);
  const head = blockAt(bot, x, y + 1, z);
  if (!isPassable(feet) || !isPassable(head)) return null;
  if (!isWalkable(blockAt(bot, x, y - 1, z))) {
    for (let h = 2; h <= MAX_DROP; h++) {
      const below = blockAt(bot, x, y - h, z);
      if (isWalkable(below)) {
        if (h > MAX_FALL_NO_WATER) return null;
        return {
          x, y: y - h + 1, z,
          g: 0, f: 0, estimatedCostToGoal: 0,
          previous: node,
          jump: false,
          toBreak: [],
          toPlace: [],
          descend: true,
          digTime: 0,
        };
      }
    }
    return null;
  }
  return {
    x, y, z,
    g: 0, f: 0, estimatedCostToGoal: 0,
    previous: node,
    jump: false,
    toBreak: [],
    toPlace: [],
    descend: true,
    digTime: 0,
  };
}

function tryMoveParkour(
  bot: Bot,
  node: AStarNode,
  dir: { x: number; z: number },
  m: MovementsConfig,
): AStarNode | null {
  if (!m.allowParkour) return null;
  const x = node.x + dir.x;
  const z = node.z + dir.z;
  const y = node.y;
  if (!isAdjacentClear(bot, x, y, z)) return null;
  const adj = blockAt(bot, x, y - 1, z);
  if (isWalkable(adj)) return null;
  if (!isAdjacentClear(bot, x, y + 1, z) || !isAdjacentClear(bot, x, y + 2, z)) return null;
  if (!isAdjacentClear(bot, node.x, node.y + 2, node.z)) return null;
  const standing = blockAt(bot, node.x, node.y - 1, node.z);
  if (isClimbable(standing)) return null;
  const maxJump = PARKOUR_MAX_DIST_SPRINT;
  for (let i = 2; i <= maxJump; i++) {
    const destX = node.x + dir.x * i;
    const destZ = node.z + dir.z * i;
    if (!isAdjacentClear(bot, destX, y + 1, destZ)) break;
    if (!isAdjacentClear(bot, destX, y + 2, destZ)) break;
    const destInto = blockAt(bot, destX, y, destZ);
    if (!isPassable(destInto)) break;
    const landing = blockAt(bot, destX, y - 1, destZ);
    if (isWalkable(landing) && landing.name !== "farmland" && safeOvershoot(bot, destX + dir.x, y, destZ + dir.z)) {
      return {
        x: destX, y, z: destZ,
        g: 0, f: 0, estimatedCostToGoal: 0,
        previous: node,
        jump: true,
        toBreak: [],
        toPlace: [],
        parkour: true,
        digTime: 0,
      };
    }
  }
  return null;
}

function tryMovePillar(
  bot: Bot,
  node: AStarNode,
  _dir: { x: number; z: number },
  _m: MovementsConfig,
): AStarNode | null {
  const x = node.x;
  const z = node.z;
  const y = node.y + 1;
  const head = blockAt(bot, x, y + 1, z);
  if (!isPassable(head)) return null;
  if (isClimbable(blockAt(bot, x, y - 1, z))) return null;
  return {
    x, y, z,
    g: 0, f: 0, estimatedCostToGoal: 0,
    previous: node,
    jump: true,
    toBreak: [],
    toPlace: [{ x: node.x, y: node.y - 1, z: node.z, dx: 0, dy: 1, dz: 0, sneak: true }],
    pillar: true,
    digTime: 0,
  };
}

function tryMoveDiagonal(
  bot: Bot,
  node: AStarNode,
  dir: { x: number; z: number },
  m: MovementsConfig,
): AStarNode | null {
  if (!m.allowParkour) return null;
  const x = node.x + dir.x;
  const z = node.z + dir.z;
  const y = node.y;
  if (!isAdjacentClear(bot, x, y, z) || !isAdjacentClear(bot, x, y + 1, z)) return null;
  if (!isWalkable(blockAt(bot, x, y - 1, z))) return null;
  return {
    x, y, z,
    g: 0, f: 0, estimatedCostToGoal: 0,
    previous: node,
    jump: false,
    toBreak: [],
    toPlace: [],
    diagonal: true,
    digTime: 0,
  };
}

function reconstruct(node: AStarNode): AStarNode[] {
  const path: AStarNode[] = [];
  let n: AStarNode | null = node;
  while (n) {
    path.unshift(n);
    n = n.previous;
  }
  return path;
}

export function astar(
  bot: Bot,
  start: { x: number; y: number; z: number },
  goal: PathGoal,
  movements: MovementsConfig,
  maxNodes = MAX_NODES,
): AStarResult {
  const sx = Math.floor(start.x);
  const sy = Math.floor(start.y);
  const sz = Math.floor(start.z);

  if (goal.isEnd({ x: sx + 0.5, y: sy, z: sz + 0.5 })) {
    return {
      status: "success",
      nodes: [{
        x: sx, y: sy, z: sz,
        g: 0, f: 0, estimatedCostToGoal: 0,
        previous: null, jump: false, toBreak: [], toPlace: [],
      }],
    };
  }

  const open = new Map<string, AStarNode>();
  const closed = new Set<string>();

  const startNode: AStarNode = {
    x: sx, y: sy, z: sz,
    g: 0,
    f: goal.heuristic({ x: sx + 0.5, y: sy, z: sz + 0.5 }),
    estimatedCostToGoal: goal.heuristic({ x: sx + 0.5, y: sy, z: sz + 0.5 }),
    previous: null, jump: false, toBreak: [], toPlace: [],
  };
  open.set(key(sx, sy, sz), startNode);

  let bestPartial: AStarNode | null = startNode;
  let bestPartialDist = 0;
  let nodes = 0;

  while (open.size > 0 && nodes < maxNodes) {
    let current: AStarNode | null = null;
    let currentKey = "";
    for (const [k, n] of open) {
      if (!current || n.f < current.f) {
        current = n;
        currentKey = k;
      }
    }
    if (!current) break;

    if (goal.isEnd({ x: current.x + 0.5, y: current.y, z: current.z + 0.5 })) {
      return { status: "success", nodes: reconstruct(current) };
    }

    open.delete(currentKey);
    closed.add(currentKey);
    nodes++;

    const distSq =
      (current.x - sx) ** 2 + (current.z - sz) ** 2;
    if (distSq > bestPartialDist) {
      bestPartialDist = distSq;
      bestPartial = current;
    }

    const neighbors: AStarNode[] = [];
    const tryAdd = (n: AStarNode | null) => {
      if (!n) return;
      const k = key(n.x, n.y, n.z);
      if (closed.has(k)) return;
      const existing = open.get(k);
      const baseCost = current.g + (
        n.jump ? SPRINT_ONE_BLOCK_COST + JUMP_PENALTY
              : n.ascend ? SPRINT_ONE_BLOCK_COST + JUMP_PENALTY
              : n.parkour ? PARKOUR_JUMP_PENALTY + (n.digTime ?? 0)
              : n.pillar ? SPRINT_ONE_BLOCK_COST + JUMP_PENALTY + PLACE_BLOCK_COST
              : n.descend ? WALK_OFF_BLOCK_COST + CENTER_AFTER_FALL_COST
              : n.toPlace.length > 0 ? WALK_ONE_BLOCK_COST + PLACE_BLOCK_COST
              : WALK_ONE_BLOCK_COST
      ) + (n.digTime ?? 0);
      const tentative = baseCost;
      if (existing && tentative >= existing.g) return;
      n.g = tentative;
      n.f = tentative + n.estimatedCostToGoal;
      n.previous = current;
      open.set(k, n);
      neighbors.push(n);
    };

    tryAdd(tryMoveTraverse(bot, current, { x: 1, z: 0 }, movements));
    tryAdd(tryMoveTraverse(bot, current, { x: -1, z: 0 }, movements));
    tryAdd(tryMoveTraverse(bot, current, { x: 0, z: 1 }, movements));
    tryAdd(tryMoveTraverse(bot, current, { x: 0, z: -1 }, movements));
    tryAdd(tryMoveAscend(bot, current, { x: 1, z: 0 }, movements));
    tryAdd(tryMoveAscend(bot, current, { x: -1, z: 0 }, movements));
    tryAdd(tryMoveAscend(bot, current, { x: 0, z: 1 }, movements));
    tryAdd(tryMoveAscend(bot, current, { x: 0, z: -1 }, movements));
    tryAdd(tryMoveDescend(bot, current, { x: 1, z: 0 }, movements));
    tryAdd(tryMoveDescend(bot, current, { x: -1, z: 0 }, movements));
    tryAdd(tryMoveDescend(bot, current, { x: 0, z: 1 }, movements));
    tryAdd(tryMoveDescend(bot, current, { x: 0, z: -1 }, movements));
    if (movements.allowParkour) {
      tryAdd(tryMoveParkour(bot, current, { x: 1, z: 0 }, movements));
      tryAdd(tryMoveParkour(bot, current, { x: -1, z: 0 }, movements));
      tryAdd(tryMoveParkour(bot, current, { x: 0, z: 1 }, movements));
      tryAdd(tryMoveParkour(bot, current, { x: 0, z: -1 }, movements));
      tryAdd(tryMoveDiagonal(bot, current, { x: 1, z: 1 }, movements));
      tryAdd(tryMoveDiagonal(bot, current, { x: -1, z: -1 }, movements));
      tryAdd(tryMoveDiagonal(bot, current, { x: 1, z: -1 }, movements));
      tryAdd(tryMoveDiagonal(bot, current, { x: -1, z: 1 }, movements));
    }
    if (movements.allow1by1towers) {
      tryAdd(tryMovePillar(bot, current, { x: 0, z: 0 }, movements));
    }
  }

  if (bestPartial && bestPartialDist >= PARTIAL_MIN_DIST * PARTIAL_MIN_DIST && bestPartial !== startNode) {
    return { status: "partial", nodes: reconstruct(bestPartial) };
  }
  return { status: "noPath", nodes: [] };
}

export { chooseBestTool, estimateDigSeconds };