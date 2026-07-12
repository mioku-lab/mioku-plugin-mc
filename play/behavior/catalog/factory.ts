import type { Behavior } from "../base-behavior";
import type { BehaviorSpec } from "../../types";
import { IdleWanderBehavior } from "./idle";
import { FollowPlayerBehavior } from "./follow";
import { SelfDefenseBehavior } from "./defend";
import { FollowAssistBehavior } from "./follow-assist";
import { GatherResourceBehavior } from "./gather";
import { FarmMobsBehavior } from "./farm-mobs";
import { GuardPositionBehavior } from "./guard";
import { SocializeBehavior } from "./socialize";
import { FleeBehavior } from "./flee";
import { ExploreBehavior } from "./explore";

export function createBehavior(spec: BehaviorSpec): Behavior {
  switch (spec.behavior) {
    case "idle":
      return new IdleWanderBehavior();
    case "follow":
      return new FollowPlayerBehavior(spec.params);
    case "defend":
      return new SelfDefenseBehavior(spec.params);
    case "follow_assist":
      return new FollowAssistBehavior(spec.params);
    case "gather":
      return new GatherResourceBehavior(spec.params);
    case "farm_mobs":
      return new FarmMobsBehavior();
    case "guard":
      return new GuardPositionBehavior(spec.params);
    case "socialize":
      return new SocializeBehavior();
    case "flee":
      return new FleeBehavior();
    case "explore":
      return new ExploreBehavior();
    default:
      return new IdleWanderBehavior();
  }
}
