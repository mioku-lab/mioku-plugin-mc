import type { Bot } from "mineflayer";
import { Vec3 } from "vec3";
import { astar, chooseBestTool, estimateDigSeconds, type AStarNode } from "./astar";
import { DEFAULT_MOVEMENTS, type MovementsConfig } from "./movements";
import type { PathGoal } from "./goals";
import { nearestPlayer, nearestHostile } from "../util/entities";

interface PendingPromise {
  resolve: () => void;
  reject: (err: Error) => void;
}

const PILLAR_PLACE_DELAY_MS = 300;
const PLACE_BLOCK_TIMEOUT_MS = 2000;
const STUCK_DISTANCE_THRESHOLD = 0.15;
const STUCK_TICK_THRESHOLD = 60;

async function placeBlockSafe(
  bot: Bot,
  refBlock: any,
  faceVec: { x: number; y: number; z: number },
): Promise<boolean> {
  if (!refBlock) return false;
  return await new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    const timer = setTimeout(() => {
      try { bot.removeAllListeners("blockUpdate"); } catch { /* ignore */ }
      finish(false);
    }, PLACE_BLOCK_TIMEOUT_MS);
    const onUpdate = (...args: any[]) => {
      const pos = args[0] || args[1];
      if (pos && pos.x === refBlock.position.x && pos.y === refBlock.position.y && pos.z === refBlock.position.z) {
        try { bot.off("blockUpdate", onUpdate); } catch { /* ignore */ }
        clearTimeout(timer);
        finish(true);
      }
    };
    try {
      bot.on("blockUpdate", onUpdate);
      try {
        const lookAt = refBlock.position;
        const target = new Vec3(lookAt.x + 0.5, lookAt.y + 0.5, lookAt.z + 0.5);
        void bot.lookAt(target, true);
      } catch { /* ignore */ }
      void bot.placeBlock(refBlock, new Vec3(faceVec.x, faceVec.y, faceVec.z))
        .then(() => {
          try { bot.off("blockUpdate", onUpdate); } catch { /* ignore */ }
          clearTimeout(timer);
          finish(true);
        })
        .catch(() => {
          try { bot.off("blockUpdate", onUpdate); } catch { /* ignore */ }
          clearTimeout(timer);
          finish(false);
        });
    } catch {
      try { bot.off("blockUpdate", onUpdate); } catch { /* ignore */ }
      clearTimeout(timer);
      finish(false);
    }
  });
}

async function faceBlockBeforeAction(
  bot: Bot,
  block: any,
  height = 0.5,
): Promise<void> {
  if (!block?.position) return;
  try {
    const target = new Vec3(
      block.position.x + 0.5,
      block.position.y + height,
      block.position.z + 0.5,
    );
    await bot.lookAt(target, true);
  } catch {
    // ignore
  }
}

export class PathEngine {
  private readonly bot: Bot;
  private goal: PathGoal | null = null;
  private path: AStarNode[] = [];
  private pathIndex = 0;
  private dynamic = false;
  private dynamicTimer: ReturnType<typeof setInterval> | null = null;
  private pending: PendingPromise | null = null;
  private stuckCount = 0;
  private lastStuckPos: { x: number; y: number; z: number } | null = null;
  private computing = false;
  private digging = false;
  private placing = false;
  private lastComputeAt = 0;
  private lastFailAt = 0;
  private lastFailLogAt = 0;
  private currentMovementOriginalCost = 0;
  private ticksOnCurrent = 0;
  private ticksAway = 0;
  private placeTimer: ReturnType<typeof setTimeout> | null = null;
  movements: MovementsConfig = DEFAULT_MOVEMENTS;
  thinkTimeout = 5000;
  tickTimeout = 40;

  private readonly log: (msg: string) => void;
  private lastDebugAt = 0;

  constructor(bot: Bot, log?: (msg: string) => void) {
    this.bot = bot;
    this.log = log ?? (() => {});
    bot.on("physicTick", () => this.tick());
  }

  setGoal(goal: PathGoal | null, dynamic = false): void {
    this.dynamic = dynamic;
    this.goal = goal;
    this.path = [];
    this.pathIndex = 0;
    this.stuckCount = 0;
    this.ticksOnCurrent = 0;
    this.ticksAway = 0;
    this.lastStuckPos = null;
    this.digging = false;
    this.placing = false;
    this.clearDynamicTimer();

    if (!goal) {
      this.stop();
      return;
    }

    this.log(`[pathEngine] setGoal dynamic=${dynamic}`);
    this.computePath();

    if (dynamic) {
      this.dynamicTimer = setInterval(() => {
        if (this.goal && !this.computing && !this.digging && !this.placing) {
          this.computePath();
        }
      }, 2000);
    }
  }

  goto(goal: PathGoal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.pending) {
        this.pending.reject(new Error("replaced"));
        this.pending = null;
      }
      this.pending = { resolve, reject };
      this.setGoal(goal, false);
    });
  }

  stop(): void {
    this.path = [];
    this.pathIndex = 0;
    this.clearDynamicTimer();
    try { this.bot.clearControlStates(); } catch { /* ignore */ }
    if (this.pending) {
      this.pending.reject(new Error("stopped"));
      this.pending = null;
    }
  }

  isMoving(): boolean {
    return this.path.length > 0 && this.pathIndex < this.path.length;
  }

  setMovements(m: MovementsConfig): void {
    this.movements = m;
  }

  private clearDynamicTimer(): void {
    if (this.dynamicTimer) {
      clearInterval(this.dynamicTimer);
      this.dynamicTimer = null;
    }
  }

  private computePath(): void {
    if (this.computing || !this.goal) return;
    const now = Date.now();
    if (this.lastFailAt > 0 && now - this.lastFailAt < 5000) return;
    const bot = this.bot;
    const start = bot.entity?.position;
    if (!start) return;
    this.computing = true;
    this.lastComputeAt = now;
    try {
      const result = astar(
        bot,
        { x: start.x, y: start.y, z: start.z },
        this.goal,
        this.movements,
        1200,
      );
      (this.bot as any).emit("pathEngine_update", result);
      if ((result.status === "success" || result.status === "partial") && result.nodes.length > 0) {
        this.path = result.nodes;
        this.pathIndex = result.nodes.length > 1 ? 1 : 0;
        this.lastFailAt = 0;
        const desc = result.nodes
          .slice(0, Math.min(result.nodes.length, 6))
          .map((n) => {
            const tag = n.jump ? "J" : n.ascend ? "A" : n.descend ? "D" : n.parkour ? "P" : n.pillar ? "Pi" : n.diagonal ? "Di" : "";
            const bk = n.toBreak.length ? "B" : "";
            const pl = n.toPlace.length ? "Pl" : "";
            return `(${n.x},${n.y},${n.z}${tag}${bk}${pl})`;
          })
          .join("->");
        this.log(
          `[pathEngine] path ${result.status} len=${result.nodes.length} from=(${Math.floor(start.x)},${Math.floor(start.y)},${Math.floor(start.z)}) ${desc}`,
        );
      } else {
        this.path = [];
        this.lastFailAt = now;
        if (now - this.lastFailLogAt > 3000) {
          this.lastFailLogAt = now;
          this.log(`[pathEngine] path 失败 status=${result.status} (5s 内不重试)`);
        }
        if (this.pending) {
          this.pending.reject(new Error(`astar:${result.status}`));
          this.pending = null;
        }
      }
    } catch (err) {
      this.log(`[pathEngine] computePath 异常: ${err}`);
    } finally {
      this.computing = false;
    }
  }

  private tick(): void {
    const bot = this.bot;
    const entity = bot.entity;
    if (!entity || !this.goal) return;

    const pos = { x: entity.position.x, y: entity.position.y, z: entity.position.z };

    if (this.goal.isReached(pos)) {
      this.goalReachedAndStop();
      return;
    }

    if (this.path.length === 1 && this.pathIndex === 0) {
      this.path = [];
      if (!this.computing && !this.digging && !this.placing) this.computePath();
      return;
    }

    if (!this.path.length || this.pathIndex >= this.path.length) {
      if (!this.computing && !this.digging && !this.placing) this.computePath();
      return;
    }

    const next = this.path[this.pathIndex];
    if (next.x === pos.x && next.y === pos.y && next.z === pos.z) {
      this.pathIndex++;
      this.ticksOnCurrent = 0;
      return;
    }

    if (next.toBreak.length > 0 && !this.digging) {
      this.handleDig(next);
      return;
    }
    if (this.digging) return;

    if (next.toPlace.length > 0 && !this.placing) {
      this.handlePlace(next);
      return;
    }
    if (this.placing) return;

    this.executeMovement(next, pos);
  }

  private handleDig(next: AStarNode): void {
    const bot = this.bot;
    const target = next.toBreak[0];
    if (!target) return;
    const block = bot.blockAt(new Vec3(target.x, target.y, target.z), false) as any;
    if (!block || isAirLike(block)) {
      next.toBreak.shift();
      return;
    }
    if (!this.digging) {
      this.digging = true;
      chooseBestTool(bot, block);
      try { bot.clearControlStates(); } catch { /* ignore */ }
    }
    void (async () => {
      try {
        await faceBlockBeforeAction(bot, block, 0.5);
        await bot.dig(block, true);
        this.log(`[pathEngine] 挖完成 ${block.name}`);
      } catch (err) {
        this.log(`[pathEngine] 挖失败 ${block.name}: ${err}`);
      } finally {
        next.toBreak.shift();
        this.digging = false;
        this.ticksOnCurrent = 0;
      }
    })();
  }

  private handlePlace(next: AStarNode): void {
    const bot = this.bot;
    const target = next.toPlace[0];
    if (!target) return;
    const isPillar = !!next.pillar;
    if (this.placing) return;
    const scaffolding = this.getScaffoldingItem();
    if (!scaffolding) {
      this.log(`[pathEngine] 搭柱/搭桥失败：背包无脚手架`);
      next.toPlace.shift();
      return;
    }
    this.placing = true;
    try { bot.clearControlStates(); } catch { /* ignore */ }

    if (isPillar) {
      void (async () => {
        try {
          await bot.equip(scaffolding, "hand");
          try { bot.setControlState("sneak", true); } catch { /* ignore */ }
          try { bot.setControlState("jump", true); } catch { /* ignore */ }
          if (this.placeTimer) clearTimeout(this.placeTimer);
          this.placeTimer = setTimeout(async () => {
            try {
              const refBlock = bot.blockAt(new Vec3(target.x, target.y, target.z), false) as any;
              if (refBlock) {
                const ok = await placeBlockSafe(bot, refBlock, { x: target.dx, y: target.dy, z: target.dz });
                if (ok) this.log(`[pathEngine] 搭柱 ${scaffolding.name}`);
                else this.log(`[pathEngine] 搭柱失败（无权限/距离等），跳过`);
              }
            } catch (err) {
              this.log(`[pathEngine] 搭柱异常: ${err}`);
            } finally {
              try { bot.setControlState("jump", false); } catch { /* ignore */ }
              try { bot.setControlState("sneak", false); } catch { /* ignore */ }
              next.toPlace.shift();
              this.placing = false;
              this.ticksOnCurrent = 0;
            }
          }, PILLAR_PLACE_DELAY_MS);
        } catch (err) {
          this.log(`[pathEngine] 搭柱准备失败: ${err}`);
          try { bot.setControlState("jump", false); } catch { /* ignore */ }
          try { bot.setControlState("sneak", false); } catch { /* ignore */ }
          next.toPlace.shift();
          this.placing = false;
        }
      })();
    } else {
      void (async () => {
        try {
          await bot.equip(scaffolding, "hand");
          const refBlock = bot.blockAt(new Vec3(target.x, target.y, target.z), false) as any;
          if (refBlock) {
            try { bot.setControlState("sneak", true); } catch { /* ignore */ }
            const ok = await placeBlockSafe(bot, refBlock, { x: target.dx, y: target.dy, z: target.dz });
            if (ok) this.log(`[pathEngine] 搭桥 ${scaffolding.name}`);
            else this.log(`[pathEngine] 搭桥失败（无权限/距离等），跳过`);
          }
        } catch (err) {
          this.log(`[pathEngine] 搭桥异常: ${err}`);
        } finally {
          try { bot.setControlState("sneak", false); } catch { /* ignore */ }
          next.toPlace.shift();
          this.placing = false;
          this.ticksOnCurrent = 0;
        }
      })();
    }
  }

  private getScaffoldingItem(): any | null {
    const items = this.bot.inventory?.items?.() ?? [];
    return (
      items.find((i: any) => i.name === "dirt") ??
      items.find((i: any) => i.name === "cobblestone") ??
      items.find((i: any) => i.name === "netherrack") ??
      items.find((i: any) => /_planks$/.test(i.name)) ??
      items.find((i: any) => /_log$/.test(i.name)) ??
      null
    );
  }

  private executeMovement(next: AStarNode, pos: { x: number; y: number; z: number }): void {
    const bot = this.bot;
    const entity = bot.entity as any;
    const nextCenter = { x: next.x + 0.5, y: next.y, z: next.z + 0.5 };
    const dx = nextCenter.x - pos.x;
    const dy = nextCenter.y - pos.y;
    const dz = nextCenter.z - pos.z;
    const horizDist = Math.sqrt(dx * dx + dz * dz);

    if (this.ticksOnCurrent === 0) {
      this.currentMovementOriginalCost = this.estimateCost(next);
    }
    this.ticksOnCurrent++;

    const lookTarget = this.pickLookTarget(nextCenter, dx, dz, pos);
    if (lookTarget) {
      try { bot.look(Math.atan2(-lookTarget.dx, -lookTarget.dz), 0, true); } catch { /* ignore */ }
    } else if (Math.abs(dx) > 0.01 || Math.abs(dz) > 0.01) {
      try { bot.look(Math.atan2(-dx, -dz), 0, true); } catch { /* ignore */ }
    }

    const wantJump = this.shouldJump(next, pos, dx, dy, dz, horizDist);

    try {
      bot.setControlState("forward", true);
      bot.setControlState("sprint", this.movements.allowSprinting);
      bot.setControlState("jump", wantJump);
    } catch { /* ignore */ }

    if (this.arrivedAt(nextCenter, pos)) {
      this.pathIndex++;
      this.ticksOnCurrent = 0;
    }

    this.checkStuck(pos);
  }

  private pickLookTarget(
    nextCenter: { x: number; y: number; z: number },
    dx: number,
    dz: number,
    pos: { x: number; y: number; z: number },
  ): { dx: number; dz: number } | null {
    const moveYaw = Math.atan2(-dx, -dz);
    try {
      const bot = this.bot;
      const player = nearestPlayer(bot, 8);
      if (player?.position) {
        const ddx = player.position.x - pos.x;
        const ddz = player.position.z - pos.z;
        const entityYaw = Math.atan2(-ddx, -ddz);
        if (this.yawDiff(moveYaw, entityYaw) < Math.PI / 3) {
          return { dx: ddx, dz: ddz };
        }
      }
      const hostile = nearestHostile(bot, 8);
      if (hostile?.position) {
        const ddx = hostile.position.x - pos.x;
        const ddz = hostile.position.z - pos.z;
        const entityYaw = Math.atan2(-ddx, -ddz);
        if (this.yawDiff(moveYaw, entityYaw) < Math.PI / 3) {
          return { dx: ddx, dz: ddz };
        }
      }
    } catch { /* ignore */ }
    void nextCenter;
    return null;
  }

  private yawDiff(a: number, b: number): number {
    let d = a - b;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return Math.abs(d);
  }

  private shouldJump(
    next: AStarNode,
    pos: { x: number; y: number; z: number },
    dx: number, dy: number, dz: number,
    horizDist: number,
  ): boolean {
    const bot = this.bot;
    if (next.ascend || next.parkour || next.pillar) return true;
    if (dy > 0.3) return true;
    const entity = bot.entity as any;
    if (entity?.isInWater) return true;
    if (horizDist > 1.2) return false;
    if (horizDist < 0.05) return false;
    if (Math.abs(dx) > 0.1 || Math.abs(dz) > 0.1) return true;
    return false;
  }

  private arrivedAt(target: { x: number; y: number; z: number }, pos: { x: number; y: number; z: number }): boolean {
    return (
      Math.abs(pos.x - target.x) < 0.45 &&
      Math.abs(pos.z - target.z) < 0.45 &&
      Math.abs(pos.y - target.y) < 1.2
    );
  }

  private estimateCost(node: AStarNode): number {
    if (node.ascend || node.parkour || node.pillar) return 40;
    if (node.descend) return 25;
    return 20;
  }

  private checkStuck(pos: { x: number; y: number; z: number }): void {
    if (this.lastStuckPos) {
      const moved = Math.sqrt(
        (pos.x - this.lastStuckPos.x) ** 2 +
          (pos.y - this.lastStuckPos.y) ** 2 +
          (pos.z - this.lastStuckPos.z) ** 2,
      );
      if (moved < STUCK_DISTANCE_THRESHOLD) {
        this.stuckCount++;
        if (this.stuckCount > STUCK_TICK_THRESHOLD) {
          this.log(`[pathEngine] 卡住，重算`);
          this.computePath();
          this.stuckCount = 0;
        }
      } else {
        this.stuckCount = 0;
      }
    }
    this.lastStuckPos = { x: pos.x, y: pos.y, z: pos.z };
  }

  private goalReachedAndStop(): void {
    this.path = [];
    this.pathIndex = 0;
    this.clearDynamicTimer();
    try { this.bot.clearControlStates(); } catch { /* ignore */ }
    (this.bot as any).emit("goal_reached");
    if (this.pending) {
      this.pending.resolve();
      this.pending = null;
    }
  }
}

function isAirLike(b: any): boolean {
  return !b || b.boundingBox === "empty";
}