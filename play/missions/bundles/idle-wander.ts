import {
  CATEGORY_PRIORITY,
  type Behavior,
} from "../../behavior/base-behavior";
import { IdleWanderBehavior } from "../../behavior/catalog/idle";
import { z } from "zod";
import type {
  BehaviorBundle,
  BehaviorEntry,
} from "../registry";

const paramsSchema = z.object({}).strict();

export const idleWanderBundle: BehaviorBundle<Record<string, never>> = {
  id: "task.idle_wander",
  description: "原地待机：随机张望 + 偶尔短走。最低优先级。",
  mode: "IDLE",
  paramsSchema,
  build(): BehaviorEntry[] {
    const b: Behavior = new IdleWanderBehavior();
    b.configure({});
    return [{ priority: CATEGORY_PRIORITY.movement, behavior: b }];
  },
};
