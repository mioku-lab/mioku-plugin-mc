import { Behavior, type BehaviorContext } from "../base-behavior";
import { goals } from "mineflayer-pathfinder";
import { nearestHostile } from "../../util/entities";
import { equipSword } from "../../util/inventory";

const RETARGET_MS = 3_000;

export class GuardPositionBehavior extends Behavior {
  readonly name = "guard";
  private x: number;
  private y: number;
  private z: number;
  private readonly radius: number;
  private retargetAt = 0;
  private attacking = false;
  private armed = false;

  constructor(params: Record<string, string>) {
    super();
    this.x = Number(params.x) || 0;
    this.y = Number(params.y) || 0;
    this.z = Number(params.z) || 0;
    this.radius = Number(params.radius) || 8;
  }

  onStart(ctx: BehaviorContext): void {
    if (this.y === 0) {
      const pos = ctx.bot.entity?.position;
      if (pos) {
        this.x = Math.floor(pos.x);
        this.y = Math.floor(pos.y);
        this.z = Math.floor(pos.z);
      }
    }
    this.armed = false;
    this.attacking = false;
  }

  async onTick(ctx: BehaviorContext): Promise<void> {
    if (!this.armed) {
      await equipSword(ctx.bot);
      this.armed = true;
    }
    const threat = nearestHostile(ctx.bot, this.radius);
    if (threat) {
      if (!this.attacking) {
        this.attacking = true;
        ctx.bot.pvp
          .attack(threat)
          .catch(() => {
            // ignore
          })
          .finally(() => {
            this.attacking = false;
          });
      }
      return;
    }
    this.attacking = false;
    try {
      await ctx.bot.pvp.stop();
    } catch {
      // ignore
    }
    if (ctx.bot.pathfinder.isMoving()) return;
    const now = Date.now();
    if (now < this.retargetAt) return;
    this.retargetAt = now + RETARGET_MS;
    ctx.bot.pathfinder
      .goto(new goals.GoalNear(this.x, this.y, this.z, this.radius))
      .catch(() => {
        // ignore
      });
  }

  onStop(ctx: BehaviorContext): void {
    try {
      ctx.bot.pvp.stop();
      ctx.bot.pathfinder.stop();
    } catch {
      // ignore
    }
  }
}
