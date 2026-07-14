import {
  CATEGORY_PRIORITY,
  type Behavior,
} from "../../behavior/base-behavior";
import { FarmMobsBehavior } from "../../behavior/catalog/farm-mobs";
import { z } from "zod";
import type {
  BehaviorBundle,
  BehaviorEntry,
} from "../registry";

const paramsSchema = z.object({}).strict();

export const farmMobsBundle: BehaviorBundle<Record<string, never>> = {
  id: "task.farm_mobs",
  description: "猎杀附近被动生物获取掉落物（牛/羊/鸡等）。",
  mode: "MISSION",
  paramsSchema,
  build(): BehaviorEntry[] {
    const b: Behavior = new FarmMobsBehavior();
    b.configure({});
    return [{ priority: CATEGORY_PRIORITY.movement, behavior: b }];
  },
};
