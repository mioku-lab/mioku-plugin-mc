import { z } from "zod";
import {
  CATEGORY_PRIORITY,
  type Behavior,
} from "../../behavior/base-behavior";
import { GatherResourceBehavior } from "../../behavior/catalog/gather";
import type {
  BehaviorBundle,
  BehaviorEntry,
  BundleBuildContext,
} from "../registry";

const paramsSchema = z.object({
  resource: z
    .enum(["wood", "stone", "coal", "iron", "dirt"])
    .default("wood")
    .describe("资源类型"),
  count: z.number().int().min(1).max(64).default(1).describe("目标采集数量"),
});

export type GatherResourceParams = z.infer<typeof paramsSchema>;

export const gatherResourceBundle: BehaviorBundle<GatherResourceParams> = {
  id: "task.gather_resource",
  description: "采集资源（wood/stone/coal/iron/dirt）。",
  mode: "MISSION",
  paramsSchema,
  build(params: GatherResourceParams): BehaviorEntry[] {
    const b: Behavior = new GatherResourceBehavior();
    b.configure({ resource: params.resource, count: String(params.count) });
    return [{ priority: CATEGORY_PRIORITY.movement, behavior: b }];
  },
  snapshot(internal: unknown): unknown {
    const i = internal as { resource: string } | null;
    return i ? { resource: i.resource } : null;
  },
};
