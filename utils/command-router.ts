export interface ParsedCommand {
  action: string;
  args: string[];
  raw: string;
}

export function parseMcCommand(text: string): ParsedCommand | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/mc")) return null;

  const remainder = trimmed.slice(3).trim();
  if (!remainder) {
    return { action: "", args: [], raw: "" };
  }

  // split into action and args
  const parts = remainder.split(/\s+/);
  const action = parts[0] || "";
  const args = parts.slice(1);

  return { action, args, raw: remainder };
}

export function matchMcCommand(
  text: string,
  pattern: RegExp
): RegExpMatchArray | null {
  const parsed = parseMcCommand(text);
  if (!parsed) return null;
  return parsed.raw.match(pattern);
}

export function buildStatusReply(
  serverName: string,
  status: string,
  displayName?: string
): string {
  const name = displayName || serverName;
  const icon = status === "connected" ? "在线" : status === "connecting" ? "连接中" : "离线";
  return `[${name}] ${icon}`;
}

export function buildSyncReply(
  serverName: string,
  enabled: boolean,
  displayName?: string
): string {
  const name = displayName || serverName;
  const action = enabled ? "开启" : "关闭";
  return `${action}了服务器 ${name} 的同步`;
}