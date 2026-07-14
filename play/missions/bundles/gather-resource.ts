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
});

export type GatherResourceParams = z.infer<typeof paramsSchema>;

export const gatherResourceBundle: BehaviorBundle<GatherResourceParams> = {
  id: "task.gather_resource",
  description: "采集资源（wood/stone/coal/iron/dirt）。",
  mode: "MISSION",
  paramsSchema,
  build(params: GatherResourceParams): BehaviorEntry[] {
    const b: Behavior = new GatherResourceBehavior();
    b.configure({ resource: params.resource });
    return [{ priority: CATEGORY_PRIORITY.movement, behavior: b }];
  },
  snapshot(internal: unknown): unknown {
    const i = internal as { resource: string } | null;
    return i ? { resource: i.resource } : null;
  },
};
