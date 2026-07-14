import type { Bot } from "mineflayer";
import { astar, type AStarResult } from "./astar";
import { DEFAULT_MOVEMENTS, type MovementsConfig } from "./movements";
import type { PathGoal } from "./goals";

interface PendingPromise {
  resolve: () => void;
  reject: (err: Error) => void;
}

export class PathEngine {
  private readonly bot: Bot;
  private goal: PathGoal | null = null;
  private path: { x: number; y: number; z: number }[] = [];
  private pathIndex = 0;
  private dynamic = false;
  private dynamicTimer: ReturnType<typeof setInterval> | null = null;
  private pending: PendingPromise | null = null;
  private stuckCount = 0;
  private lastStuckPos: { x: number; y: number; z: number } | null = null;
  private computing = false;
  movements: MovementsConfig = DEFAULT_MOVEMENTS;
  thinkTimeout = 5000;
  tickTimeout = 40;

  constructor(bot: Bot) {
    this.bot = bot;
    bot.on("physicTick", () => this.tick());
  }

  setGoal(goal: PathGoal | null, dynamic = false): void {
    this.dynamic = dynamic;
    this.goal = goal;
    this.path = [];
    this.pathIndex = 0;
    this.stuckCount = 0;
    this.lastStuckPos = null;
    this.clearDynamicTimer();

    if (!goal) {
      this.stop();
      return;
    }

    this.computePath();

    if (dynamic) {
      this.dynamicTimer = setInterval(() => {
        if (this.goal && !this.computing) this.computePath();
      }, 1000);
    }
  }

  goto(goal: PathGoal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.pending) {
        this.pending.reject(new Error("replaced by new goal"));
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
    try {
      this.bot.clearControlStates();
    } catch {
      // ignore
    }
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
    const bot = this.bot;
    const start = bot.entity?.position;
    if (!start) return;
    this.computing = true;
    try {
      const result: AStarResult = astar(
        bot,
        { x: start.x, y: start.y, z: start.z },
        this.goal,
        this.movements,
        3000,
      );
      (this.bot as any).emit("pathEngine_update", result);
      if (result.status === "success" && result.path.length > 0) {
        this.path = result.path;
        this.pathIndex = 0;
      } else {
        this.path = [];
        if (this.pending) {
          this.pending.reject(new Error(`astar:${result.status}`));
          this.pending = null;
        }
      }
    } finally {
      this.computing = false;
    }
  }

  private tick(): void {
    const bot = this.bot;
    const entity = bot.entity;
    if (!entity || !this.goal) return;

    const pos = {
      x: entity.position.x,
      y: entity.position.y,
      z: entity.position.z,
    };

    if (this.goal.isEnd(pos)) {
      this.goalReachedAndStop();
      return;
    }

    if (!this.path.length || this.pathIndex >= this.path.length) {
      if (!this.computing) this.computePath();
      return;
    }

    const next = this.path[this.pathIndex];
    const dx = next.x - pos.x;
    const dy = next.y - pos.y;
    const dz = next.z - pos.z;
    const horizDist = Math.sqrt(dx * dx + dz * dz);

    if (horizDist > 0.1) {
      try {
        bot.look(Math.atan2(-dx, -dz), 0, true);
      } catch {
        // ignore
      }
    }

    try {
      bot.setControlState("forward", true);
      bot.setControlState("sprint", this.movements.allowSprinting);
      if (dy > 0.3) {
        bot.setControlState("jump", true);
      } else if ((entity as any).isInWater) {
        bot.setControlState("jump", true);
      } else {
        bot.setControlState("jump", false);
      }
    } catch {
      // ignore
    }

    if (Math.abs(dx) < 0.4 && Math.abs(dz) < 0.4 && Math.abs(dy) < 1.0) {
      this.pathIndex++;
    }

    this.checkStuck();
  }

  private goalReachedAndStop(): void {
    this.path = [];
    this.pathIndex = 0;
    this.clearDynamicTimer();
    try {
      this.bot.clearControlStates();
    } catch {
      // ignore
    }
    (this.bot as any).emit("goal_reached");
    if (this.pending) {
      this.pending.resolve();
      this.pending = null;
    }
  }

  private checkStuck(): void {
    const pos = this.bot.entity?.position;
    if (!pos) return;
    if (this.lastStuckPos) {
      const moved = Math.sqrt(
        (pos.x - this.lastStuckPos.x) ** 2 +
          (pos.y - this.lastStuckPos.y) ** 2 +
          (pos.z - this.lastStuckPos.z) ** 2,
      );
      if (moved < 0.15) {
        this.stuckCount++;
        if (this.stuckCount >= 40) {
          (this.bot as any).emit("pathEngine_update", { status: "stuck", path: [] });
          this.computePath();
          this.stuckCount = 0;
        }
      } else {
        this.stuckCount = 0;
      }
    }
    this.lastStuckPos = { x: pos.x, y: pos.y, z: pos.z };
  }
}