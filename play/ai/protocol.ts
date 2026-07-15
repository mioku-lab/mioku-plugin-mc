import { z } from "zod";

export const MainDecisionSchema = z.object({
  gameMessages: z.array(z.string().trim().min(1).max(256)).max(3).default([]),
  directive: z
    .object({
      goal: z.string().trim().min(1).max(1000),
      replace: z.boolean().default(true),
    })
    .nullable()
    .optional(),
  leave: z.boolean().default(false),
  noActionReason: z.string().trim().max(500).optional(),
});

export type MainDecision = z.infer<typeof MainDecisionSchema>;

export const WorkDecisionSchema = z.object({
  kind: z.enum([
    "start_state",
    "perform_action",
    "stop",
    "wait",
    "request_main",
  ]),
  state: z.string().trim().min(1).optional(),
  action: z.string().trim().min(1).optional(),
  params: z.record(z.unknown()).default({}),
  objective: z.string().trim().max(1000).optional(),
  reason: z.string().trim().max(1000).optional(),
  completesDirectiveOnSuccess: z.boolean().default(true),
});

export type WorkDecision = z.infer<typeof WorkDecisionSchema>;

export const MAIN_DECISION_TOOL = {
  type: "function" as const,
  function: {
    name: "submit_main_decision",
    description:
      "Submit the Minecraft social response and an optional high-level directive for the working agent.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        gameMessages: {
          type: "array",
          maxItems: 3,
          items: { type: "string" },
          description: "Short in-game chat lines. Never send QQ messages.",
        },
        directive: {
          anyOf: [
            {
              type: "object",
              additionalProperties: false,
              properties: {
                goal: { type: "string" },
                replace: { type: "boolean" },
              },
              required: ["goal"],
            },
            { type: "null" },
          ],
        },
        leave: { type: "boolean" },
        noActionReason: { type: "string" },
      },
      required: ["gameMessages", "leave"],
    },
  },
};

export const WORK_DECISION_TOOL = {
  type: "function" as const,
  function: {
    name: "submit_work_decision",
    description:
      "Choose exactly one high-level Minecraft state, one atomic action, or wait safely.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        kind: {
          type: "string",
          enum: [
            "start_state",
            "perform_action",
            "stop",
            "wait",
            "request_main",
          ],
        },
        state: { type: "string" },
        action: { type: "string" },
        params: { type: "object", additionalProperties: true },
        objective: { type: "string" },
        reason: { type: "string" },
        completesDirectiveOnSuccess: { type: "boolean" },
      },
      required: ["kind", "params", "completesDirectiveOnSuccess"],
    },
  },
};

export function parseDecisionToolCall<S extends z.ZodTypeAny>(
  calls: Array<{ name: string; arguments: string }> | undefined,
  name: string,
  schema: S,
): z.output<S> | null {
  const call = calls?.find((item) => item.name === name);
  if (!call) return null;
  try {
    const parsed = JSON.parse(call.arguments || "{}");
    const result = schema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
