import { z } from "zod";
import type { Behavior, BehaviorMissionReporter } from "../behavior/base-behavior";
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
  mission: BehaviorMissionReporter;
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

  describe(): Array<BundleListEntry & { params: unknown }> {
    return [...this.bundles.values()]
      .map((bundle) => ({
        id: bundle.id,
        description: bundle.description,
        mode: bundle.mode,
        params: describeSchema(bundle.paramsSchema),
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
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

function describeSchema(schema: z.ZodTypeAny): unknown {
  const definition = (schema as any)?._def;
  if (definition?.typeName !== z.ZodFirstPartyTypeKind.ZodObject) return {};
  const shape = definition.shape();
  const out: Record<string, string> = {};
  for (const key of Object.keys(shape).sort()) {
    out[key] = String(shape[key]?._def?.description ?? shape[key]?._def?.typeName ?? "unknown");
  }
  return out;
}
