import { z } from "zod";
import { CATEGORY_PRIORITY, type Behavior } from "../../behavior/base-behavior";
import { ApproachPlayerBehavior } from "../../behavior/catalog/approach-player";
import type { BehaviorBundle, BehaviorEntry } from "../registry";

const paramsSchema = z.object({
  target: z.string().min(1).describe("玩家名"),
  distance: z.number().int().min(1).max(10).default(3).describe("接近到多少格"),
});

export const approachPlayerBundle: BehaviorBundle<
  z.infer<typeof paramsSchema>
> = {
  id: "task.approach_player",
  description: "接近指定玩家，到达目标距离后完成。",
  mode: "MISSION",
  paramsSchema,
  build(params): BehaviorEntry[] {
    const behavior: Behavior = new ApproachPlayerBehavior();
    behavior.configure({
      target: params.target,
      distance: String(params.distance),
    });
    return [{ priority: CATEGORY_PRIORITY.movement, behavior }];
  },
};
