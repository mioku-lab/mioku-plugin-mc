import { Behavior, type BehaviorContext } from "../base-behavior";

const FALL_VELOCITY_THRESHOLD = -0.7;

export class MlgFallBehavior extends Behavior {
  readonly name = "mlg_fall";
  readonly category = "survival" as const;
  private placed = false;

  isActive(ctx: BehaviorContext): boolean {
    const bot = ctx.bot;
    const vy = bot.entity?.velocity?.y;
    if (vy === undefined || vy >= FALL_VELOCITY_THRESHOLD) return false;
    const head = bot.entity?.position;
    if (!head) return false;
    const below = bot.blockAt(head.offset(0, -2, 0));
    const n = String(below?.name ?? "").toLowerCase();
    return n !== "water" && n !== "lava";
  }

  onStart(): void {
    this.placed = false;
  }

  onTick(ctx: BehaviorContext): void {
    if (this.placed) return;
    const bot = ctx.bot;
    const bucket = bot.inventory?.items?.().find((i: any) => i.name === "water_bucket");
    if (!bucket) return;
    this.placed = true;
    void (async () => {
      try {
        await bot.equip(bucket, "hand");
        bot.look(0, Math.PI / 2, true);
        bot.activateItem();
        setTimeout(() => {
          try {
            bot.activateItem();
          } catch {
            // ignore
          }
        }, 400);
      } catch {
        this.placed = false;
      }
    })();
  }

  contributesState(): Record<string, unknown> {
    return {
      active: true,
      waterBucketPlaced: this.placed,
    };
  }
}
