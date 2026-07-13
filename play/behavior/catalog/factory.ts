import type { Behavior } from "../base-behavior";
import type { BehaviorSpec } from "../../types";
import { IdleWanderBehavior } from "./idle";
import { FollowPlayerBehavior } from "./follow";
import { GatherResourceBehavior } from "./gather";
import { FarmMobsBehavior } from "./farm-mobs";
import { GuardPositionBehavior } from "./guard";
import { SocializeBehavior } from "./socialize";
import { FleeBehavior } from "./flee";
import { ExploreBehavior } from "./explore";

const MOVEMENT_FACTORIES: Record<string, () => Behavior> = {
  idle: () => new IdleWanderBehavior(),
  follow: () => new FollowPlayerBehavior(),
  gather: () => new GatherResourceBehavior(),
  farm_mobs: () => new FarmMobsBehavior(),
  guard: () => new GuardPositionBehavior(),
  socialize: () => new SocializeBehavior(),
  flee: () => new FleeBehavior(),
  explore: () => new ExploreBehavior(),
};

export function createBehavior(spec: BehaviorSpec): Behavior {
  const factory = MOVEMENT_FACTORIES[spec.behavior];
  const behavior = factory ? factory() : new IdleWanderBehavior();
  behavior.configure(spec.params ?? {});
  return behavior;
}

export const MOVEMENT_BEHAVIOR_NAMES = Object.keys(MOVEMENT_FACTORIES);
