import type { PlayConfig } from "../types";

type LoggerLike = {
  info: (msg: string) => void;
  warn: (msg: string) => void;
};

export interface AiLogRequest {
  messages: Array<{ role: string; content: unknown }>;
  tools?: Array<{ function?: { name?: string } } | undefined>;
  temperature?: number;
  max_tokens?: number;
  trigger?: string;
  triggerEvents?: unknown;
}

export interface AiLogResponse {
  content?: string | null;
  reasoning?: string | null;
  toolCalls?: Array<{ name: string; arguments: string }>;
  durationMs: number;
  error?: unknown;
}

export function logAiRequest(
  logger: LoggerLike,
  config: PlayConfig,
  tag: "main" | "work" | "goodbye",
  payload: AiLogRequest,
): void {
  if (!config.debug.enabled) return;
  const toolNames = (payload.tools ?? [])
    .map((t) => t?.function?.name)
    .filter((name): name is string => typeof name === "string")
    .join(", ");
  const lines: string[] = [];
  lines.push(
    `[MC/play] ▶ AI req (${tag})` +
      ` T=${payload.temperature ?? "?"}` +
      ` max=${payload.max_tokens ?? "?"}` +
      (toolNames ? ` tools=[${toolNames}]` : "") +
      (payload.trigger ? ` trigger=${payload.trigger}` : "") +
      (Array.isArray(payload.triggerEvents)
        ? ` events=${payload.triggerEvents.length}`
        : ""),
  );
  for (const message of payload.messages) {
    const role = String(message.role ?? "unknown");
    const text = stringifyContent(message.content);
    lines.push(`  ↳ ${role} (${text.length}c): ${truncate(text, 600)}`);
  }
  logger.info(lines.join("\n"));
}

export function logAiResponse(
  logger: LoggerLike,
  config: PlayConfig,
  tag: "main" | "work" | "goodbye",
  payload: AiLogResponse,
): void {
  if (!config.debug.enabled) return;
  if (payload.error !== undefined) {
    logger.warn(
      `[MC/play] ◀ AI resp (${tag}) failed in ${payload.durationMs}ms: ${stringifyError(payload.error)}`,
    );
    return;
  }
  const parts: string[] = [];
  parts.push(`[MC/play] ◀ AI resp (${tag}) ${payload.durationMs}ms`);
  const contentText = safeText(payload.content);
  if (contentText && contentText.length > 0) {
    parts.push(`text=${truncate(contentText, 600)}`);
  }
  const reasoningText = safeText(payload.reasoning);
  if (reasoningText && reasoningText.length > 0) {
    parts.push(`reasoning=${truncate(reasoningText, 300)}`);
  }
  if (payload.toolCalls && payload.toolCalls.length > 0) {
    for (const call of payload.toolCalls) {
      const name = safeText(call.name) ?? "(unnamed)";
      const args = safeText(call.arguments) ?? "{}";
      parts.push(`tool=${name}(${truncate(args, 400)})`);
    }
  }
  if (parts.length === 1) parts.push("(empty)");
  logger.info(parts.join(" | "));
}

function stringifyContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (content == null) return "";
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (!part || typeof part !== "object") return String(part);
        const obj = part as Record<string, unknown>;
        if (obj.type === "text" && typeof obj.text === "string") return obj.text;
        try {
          return JSON.stringify(part);
        } catch {
          return String(part);
        }
      })
      .join(" ");
  }
  if (typeof content === "object") {
    try {
      return JSON.stringify(content);
    } catch {
      return "[unserializable]";
    }
  }
  return String(content);
}

function safeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value;
}

function truncate(text: unknown, max: number): string {
  const raw = typeof text === "string" ? text : safeText(text) ?? "";
  const collapsed = raw.replace(/\s+/g, " ").trim();
  return collapsed.length > max ? collapsed.slice(0, max) + "…" : collapsed;
}

function stringifyError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}