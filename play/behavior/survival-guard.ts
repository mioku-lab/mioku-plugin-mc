import type { BehaviorContext, SurvivalBehavior } from "./base-behavior";

export class SurvivalGuard {
  private behaviors: SurvivalBehavior[];

  constructor(behaviors: SurvivalBehavior[] = []) {
    this.behaviors = behaviors;
  }

  check(ctx: BehaviorContext): SurvivalBehavior | null {
    for (const b of this.behaviors) {
      try {
        if (b.shouldActivate(ctx)) return b;
      } catch {
        // ignore a failing check; next tick will retry
      }
    }
    return null;
  }
}
