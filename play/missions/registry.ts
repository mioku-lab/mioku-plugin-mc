import { z } from "zod";
import type { Behavior } from "../behavior/base-behavior";
import type { BehaviorMode } from "../state/mode";

export interface BehaviorEntry {
  priority: number;
  behavior: Behavior;
}

export interface BundleBuildContext {
  bot: any;
  movements: any;
  log: (msg: string) => void;
  bus: any;
}

export interface MissionContext extends BundleBuildContext {
  startedAt: number;
  internal: unknown;
}

export interface BehaviorBundle<P = Record<string, unknown>> {
  readonly id: string;
  readonly description: string;
  readonly paramsSchema: z.ZodType<P, any, any>;
  readonly mode: BehaviorMode | null;
  build(params: P, ctx: BundleBuildContext): BehaviorEntry[];
  isFinished?(ctx: MissionContext): boolean;
  snapshot?(internal: unknown): unknown;
  serialize?(): unknown;
  deserialize?(data: unknown): void;
}

export type BundleId = string;

export type ValidateResult =
  | { ok: true; params: unknown }
  | { ok: false; error: string };

export interface BundleListEntry {
  id: string;
  description: string;
  mode: BehaviorMode | null;
}

export class TaskRegistry {
  private bundles = new Map<BundleId, BehaviorBundle>();

  register<P>(bundle: BehaviorBundle<P>): void {
    this.bundles.set(bundle.id, bundle as unknown as BehaviorBundle);
  }

  get(id: string): BehaviorBundle | undefined {
    return this.bundles.get(id);
  }

  list(): BundleListEntry[] {
    return [...this.bundles.values()].map((b) => ({
      id: b.id,
      description: b.description,
      mode: b.mode,
    }));
  }

  validate(id: string, params: unknown): ValidateResult {
    const bundle = this.bundles.get(id);
    if (!bundle) {
      return {
        ok: false,
        error: `unknown_bundle: ${id} (available: ${this.list().map((b) => b.id).join(", ") || "none"})`,
      };
    }
    const result = bundle.paramsSchema.safeParse(params ?? {});
    if (!result.success) {
      return {
        ok: false,
        error: `invalid_params: ${result.error.issues
          .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
          .join("; ")}`,
      };
    }
    return { ok: true, params: result.data };
  }
}
