import type { BehaviorSpec } from "../types";

export interface ParsedMainOutput {
  chatLines: string[];
  actions: string[];
  qqMessages: string[];
  exit: boolean;
}

const ACTION_RE = /^\[action:\s*(.+)\]$/i;
const QQ_RE = /^\[qq:\s*(.+)\]$/i;
const EXIT_RE = /^\[exit\]$/i;

export function parseMainOutput(text: string): ParsedMainOutput {
  const result: ParsedMainOutput = {
    chatLines: [],
    actions: [],
    qqMessages: [],
    exit: false,
  };
  const rawLines = String(text || "").split(/\r?\n/);
  for (const raw of rawLines) {
    const line = raw.trim();
    if (!line) continue;
    const action = line.match(ACTION_RE);
    if (action) {
      result.actions.push(action[1].trim());
      continue;
    }
    const qq = line.match(QQ_RE);
    if (qq) {
      result.qqMessages.push(qq[1].trim());
      continue;
    }
    if (EXIT_RE.test(line)) {
      result.exit = true;
      continue;
    }
    result.chatLines.push(line);
  }
  return result;
}

const BEHAVIOR_RE = /^behavior=(\w+)(?:\s+(.*))?$/i;

export function parseWorkOutput(text: string): BehaviorSpec {
  const line =
    String(text || "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find(Boolean) ?? "";
  const m = line.match(BEHAVIOR_RE);
  if (!m) return { behavior: "idle", params: {} };
  const behavior = m[1].toLowerCase();
  const params: Record<string, string> = {};
  if (m[2]) {
    for (const part of m[2].split(/\s+/)) {
      const eq = part.indexOf("=");
      if (eq > 0) {
        params[part.slice(0, eq)] = part.slice(eq + 1);
      }
    }
  }
  return { behavior, params };
}
