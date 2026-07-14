import {
  CATEGORY_PRIORITY,
  type Behavior,
} from "../../behavior/base-behavior";
import { ExploreBehavior } from "../../behavior/catalog/explore";
import { z } from "zod";
import type {
  BehaviorBundle,
  BehaviorEntry,
} from "../registry";

const paramsSchema = z.object({}).strict();

export const exploreBundle: BehaviorBundle<Record<string, never>> = {
  id: "task.explore",
  description: "随机探索 12 格范围以加载新区块。",
  mode: "MISSION",
  paramsSchema,
  build(): BehaviorEntry[] {
    const b: Behavior = new ExploreBehavior();
    b.configure({});
    return [{ priority: CATEGORY_PRIORITY.movement, behavior: b }];
  },
};
