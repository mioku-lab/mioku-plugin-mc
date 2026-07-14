import { z } from "zod";
import {
  CATEGORY_PRIORITY,
  type Behavior,
} from "../../behavior/base-behavior";
import { FollowPlayerBehavior } from "../../behavior/catalog/follow";
import type {
  BehaviorBundle,
  BehaviorEntry,
  BundleBuildContext,
  MissionContext,
} from "../registry";

const paramsSchema = z.object({
  target: z.string().min(1).describe("玩家名"),
  distance: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .default(3)
    .describe("保持距离 (1-20)"),
});

export type FollowPlayerParams = z.infer<typeof paramsSchema>;

export const followPlayerBundle: BehaviorBundle<FollowPlayerParams> = {
  id: "task.follow_player",
  description: "跟随指定玩家。玩家离线或跨维度时自动停止。",
  mode: "MISSION",
  paramsSchema,
  build(params: FollowPlayerParams, ctx: BundleBuildContext): BehaviorEntry[] {
    const b: Behavior = new FollowPlayerBehavior();
    b.configure({
      target: params.target,
      distance: String(params.distance),
    });
    return [{ priority: CATEGORY_PRIORITY.movement, behavior: b }];
  },
  isFinished(ctx: MissionContext): boolean {
    const internal = ctx.internal as { target: string } | null;
    if (!internal?.target) return true;
    const player = (ctx as any).bot?.players?.[internal.target]?.entity;
    return !player;
  },
  snapshot(internal: unknown): unknown {
    const i = internal as { target: string; distance: number } | null;
    return i ? { target: i.target, distance: i.distance } : null;
  },
};
