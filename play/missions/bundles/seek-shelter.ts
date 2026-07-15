import { z } from "zod";
import { CATEGORY_PRIORITY, type Behavior } from "../../behavior/base-behavior";
import { SeekShelterBehavior } from "../../behavior/catalog/seek-shelter";
import type { BehaviorBundle, BehaviorEntry } from "../registry";

const paramsSchema = z.object({}).strict();

export const seekShelterBundle: BehaviorBundle<Record<string, never>> = {
  id: "task.seek_shelter",
  description: "寻找附近有实体屋顶的安全位置，到达后完成。",
  mode: "MISSION",
  paramsSchema,
  build(): BehaviorEntry[] {
    const behavior: Behavior = new SeekShelterBehavior();
    behavior.configure({});
    return [{ priority: CATEGORY_PRIORITY.movement, behavior }];
  },
};
