import type { Bot } from "mineflayer";
import { getBlock, isAir, isSolid, type MovementsConfig } from "./movements";
import type { PathGoal } from "./goals";

interface AStarNode {
  x: number;
  y: number;
  z: number;
  g: number;
  f: number;
  parent: AStarNode | null;
}

function key(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

const DIRECTIONS = [
  { x: 1, z: 0 },
  { x: -1, z: 0 },
  { x: 0, z: 1 },
  { x: 0, z: -1 },
];

export type AStarResult =
  | { path: { x: number; y: number; z: number }[]; status: "success" }
  | { path: []; status: "noPath" | "timeout" };

export function astar(
  bot: Bot,
  start: { x: number; y: number; z: number },
  goal: PathGoal,
  movements: MovementsConfig,
  maxNodes = 3000,
): AStarResult {
  const sx = Math.floor(start.x);
  const sy = Math.floor(start.y);
  const sz = Math.floor(start.z);

  if (goal.isEnd({ x: sx, y: sy, z: sz })) {
    return { path: [{ x: sx, y: sy, z: sz }], status: "success" };
  }

  const open = new Map<string, AStarNode>();
  const closed = new Set<string>();

  const startNode: AStarNode = {
    x: sx,
    y: sy,
    z: sz,
    g: 0,
    f: goal.heuristic({ x: sx, y: sy, z: sz }),
    parent: null,
  };
  open.set(key(sx, sy, sz), startNode);

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

    if (goal.isEnd({ x: current.x, y: current.y, z: current.z })) {
      const path: { x: number; y: number; z: number }[] = [];
      let n: AStarNode | null = current;
      while (n) {
        path.unshift({ x: n.x, y: n.y, z: n.z });
        n = n.parent;
      }
      return { path, status: "success" };
    }

    open.delete(currentKey);
    closed.add(currentKey);
    nodes++;

    for (const dir of DIRECTIONS) {
      const nx = current.x + dir.x;
      const nz = current.z + dir.z;

      if (tryAdd(bot, open, closed, current, nx, current.y, nz, 1, goal, movements)) continue;
      if (current.y > 0 && tryAdd(bot, open, closed, current, nx, current.y - 1, nz, 1.5, goal, movements)) continue;
      if (tryAdd(bot, open, closed, current, nx, current.y + 1, nz, 2, goal, movements)) continue;
    }
  }

  return { path: [], status: nodes >= maxNodes ? "timeout" : "noPath" };
}

function tryAdd(
  bot: Bot,
  open: Map<string, AStarNode>,
  closed: Set<string>,
  current: AStarNode,
  nx: number,
  ny: number,
  nz: number,
  moveCost: number,
  goal: PathGoal,
  movements: MovementsConfig,
): boolean {
  const standing = getBlock(bot, nx, ny, nz);
  if (!isAir(standing)) return false;
  const head = getBlock(bot, nx, ny + 1, nz);
  if (!isAir(head)) return false;

  if (ny < current.y) {
    const floor = getBlock(bot, nx, ny - 1, nz);
    if (!isSolid(floor)) return false;
    const drop = current.y - ny;
    if (drop > movements.maxDropDown) return false;
  }

  const nk = key(nx, ny, nz);
  if (closed.has(nk)) return false;

  const tentativeG = current.g + moveCost;
  const existing = open.get(nk);
  if (existing && tentativeG >= existing.g) return false;

  const h = goal.heuristic({ x: nx, y: ny, z: nz });
  const newNode: AStarNode = {
    x: nx,
    y: ny,
    z: nz,
    g: tentativeG,
    f: tentativeG + h,
    parent: current,
  };
  open.set(nk, newNode);
  return true;
}