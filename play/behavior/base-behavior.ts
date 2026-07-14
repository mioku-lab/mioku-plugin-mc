import type { Bot } from "mineflayer";
import type { MovementsConfig } from "../path-engine";

export interface BehaviorContext {
  bot: Bot;
  movements: MovementsConfig;
  log: (msg: string) => void;
}

export type BehaviorCategory = "survival" | "combat" | "maintenance" | "movement";

export const CATEGORY_PRIORITY: Record<BehaviorCategory, number> = {
  survival: 100,
  combat: 70,
  maintenance: 60,
  movement: 50,
};

export abstract class Behavior {
  abstract readonly name: string;
  abstract readonly category: BehaviorCategory;
  readonly priorityOverride?: number;
  enabled = false;
  protected params: Record<string, string> = {};

  get priority(): number {
    return this.priorityOverride ?? CATEGORY_PRIORITY[this.category];
  }

  get effectivelyEnabled(): boolean {
    return this.enabled || this.category === "survival";
  }

  isActive(_ctx: BehaviorContext): boolean {
    return true;
  }

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

  /**
   * 对外暴露的内部状态（LLM 调试 / snapshot 用）。
   * 默认返回空对象；子类覆写以贡献字段。键名应稳定、字符串或简单类型，
   * 不返回 entity.position 等敏感坐标（距离/ID/名字 安全）。
   */
  contributesState(_ctx: BehaviorContext): Record<string, unknown> {
    return {};
  }

  configure(params: Record<string, string>): void {
    this.params = params;
    this.onConfigure(params);
  }

  protected onConfigure(_params: Record<string, string>): void {
    // subclasses read params here
  }
}
