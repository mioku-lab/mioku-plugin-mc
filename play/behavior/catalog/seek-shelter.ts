import { Vec3 } from "vec3";
import { Behavior, type BehaviorContext } from "../base-behavior";
import { GoalNear } from "../../path-engine";

export class SeekShelterBehavior extends Behavior {
  readonly name = "seek_shelter";
  readonly category = "movement" as const;
  private moving = false;
  private attempted = false;

  onTick(ctx: BehaviorContext): void {
    if (this.moving || this.attempted) return;
    this.attempted = true;
    const target = findShelteredPosition(ctx.bot);
    if (!target) {
      this.mission?.block("resource_not_found", "附近没有找到可到达的遮蔽位置");
      return;
    }
    const engine = ctx.bot.pathEngine;
    if (!engine) {
      this.mission?.fail("path_unreachable", "寻路引擎不可用");
      return;
    }
    this.moving = true;
    engine
      .goto(new GoalNear(target.x, target.y, target.z, 1))
      .then(() => this.mission?.succeed("已到达遮蔽位置", target))
      .catch((error: unknown) =>
        this.mission?.fail("path_unreachable", String(error), target),
      )
      .finally(() => {
        this.moving = false;
      });
  }

  onStop(ctx: BehaviorContext): void {
    try {
      ctx.bot.pathEngine?.stop();
    } catch {
      // ignore
    }
  }
}

function findShelteredPosition(
  bot: any,
): { x: number; y: number; z: number } | null {
  const position = bot.entity?.position;
  if (!position) return null;
  const y = Math.floor(position.y);
  for (let radius = 0; radius <= 12; radius++) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (radius > 0 && Math.abs(dx) !== radius && Math.abs(dz) !== radius)
          continue;
        const x = Math.floor(position.x) + dx;
        const z = Math.floor(position.z) + dz;
        const floor = bot.blockAt(new Vec3(x, y - 1, z), false);
        const feet = bot.blockAt(new Vec3(x, y, z), false);
        const head = bot.blockAt(new Vec3(x, y + 1, z), false);
        const roof = bot.blockAt(new Vec3(x, y + 2, z), false);
        if (isSolid(floor) && isAir(feet) && isAir(head) && isSolid(roof))
          return { x, y, z };
      }
    }
  }
  return null;
}

function isAir(block: any): boolean {
  return (
    !block ||
    block.boundingBox === "empty" ||
    block.name === "air" ||
    block.name === "cave_air"
  );
}

function isSolid(block: any): boolean {
  return (
    !!block &&
    block.boundingBox !== "empty" &&
    !/^(water|lava|fire)$/.test(String(block.name))
  );
}
