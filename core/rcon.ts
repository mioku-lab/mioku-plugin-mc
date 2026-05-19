import type { ServerConfig } from "../types";

export interface CommandResult {
  status?: string;
  message?: string;
  data?: unknown;
}

export function parseCommand(
  text: string,
  serverItem: ServerConfig,
): string | null {
  const header = serverItem.command_header || "$";
  const trimmed = text.trim();

  if (!header || !trimmed.startsWith(header)) {
    return null;
  }

  return trimmed.slice(header.length).trim();
}

export function isCommandAllowed(
  text: string,
  serverItem: ServerConfig,
  isMaster: boolean,
  userId: number | string,
): boolean {
  if (isMaster) return true;

  // check whitelist
  const cmdName = getCommandName(text);
  const whitelist = serverItem.rcon_command_whitelist || [];
  if (whitelist.some((w) => String(w).replace(/^\/+/, "") === cmdName)) {
    return true;
  }

  // check user list
  const userList = serverItem.command_user || [];
  return userList.some((u) => String(u) === String(userId));
}

function getCommandName(text: string): string {
  const trimmed = String(text).trim();
  const parts = trimmed.split(/\s+/, 1);
  return parts[0] || "";
}

export function formatCommandResult(raw: unknown): string {
  if (raw === null || raw === undefined || raw === "") {
    return "命令执行成功";
  }

  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return formatCommandResult(parsed);
    } catch {
      return raw;
    }
  }

  if (typeof raw !== "object") {
    return String(raw);
  }

  const obj = raw as Record<string, unknown>;

  if (obj.data !== null && obj.data !== undefined && obj.data !== "") {
    return typeof obj.data === "string"
      ? String(obj.data)
      : JSON.stringify(obj.data);
  }

  const status = String(obj.status || "")
    .trim()
    .toUpperCase();
  const message = String(obj.message || "").trim();

  if (status && status !== "SUCCESS") {
    return message || `命令执行失败 (${status})`;
  }

  return message || "命令执行成功";
}
