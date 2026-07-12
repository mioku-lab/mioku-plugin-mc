import type { Bot } from "mineflayer";
import type { Movements } from "mineflayer-pathfinder";

export interface BehaviorContext {
  bot: Bot;
  movements: Movements;
  log: (msg: string) => void;
}

export abstract class Behavior {
  abstract readonly name: string;
  priority = 0;
  onStart(_ctx: BehaviorContext): void | Promise<void> {
    // noop by default
  }
  abstract onTick(ctx: BehaviorContext): void | Promise<void>;
  onStop(_ctx: BehaviorContext): void | Promise<void> {
    // noop by default
  }
  isFinished(): boolean {
    return false;
  }
  canBeInterrupted(): boolean {
    return true;
  }
}

export abstract class SurvivalBehavior extends Behavior {
  priority = 100;
  canBeInterrupted(): boolean {
    return false;
  }
  abstract shouldActivate(ctx: BehaviorContext): boolean;
}
