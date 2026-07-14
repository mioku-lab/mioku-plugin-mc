import type { Behavior } from "../base-behavior";
import type { MovementInit } from "../../types";
import { IdleWanderBehavior } from "./idle";
import { FollowPlayerBehavior } from "./follow";
import { GatherResourceBehavior } from "./gather";
import { FarmMobsBehavior } from "./farm-mobs";
import { ExploreBehavior } from "./explore";

const MOVEMENT_FACTORIES: Record<string, () => Behavior> = {
  idle: () => new IdleWanderBehavior(),
  follow: () => new FollowPlayerBehavior(),
  gather: () => new GatherResourceBehavior(),
  farm_mobs: () => new FarmMobsBehavior(),
  explore: () => new ExploreBehavior(),
};

export function createBehavior(init: MovementInit): Behavior {
  const factory = MOVEMENT_FACTORIES[init.name];
  const behavior = factory ? factory() : new IdleWanderBehavior();
  behavior.configure(init.params ?? {});
  return behavior;
}

export function hasMovementFactory(name: string): boolean {
  return name in MOVEMENT_FACTORIES;
}
