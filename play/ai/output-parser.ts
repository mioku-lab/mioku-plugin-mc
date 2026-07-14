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

export interface ParsedWorkOutput {
  bundle: string;
  params: Record<string, unknown>;
}

export function parseWorkOutput(text: string): ParsedWorkOutput {
  const line =
    String(text || "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find(Boolean) ?? "";

  const json = tryParseJson(line);
  if (json) {
    const bundle = (json.bundle ?? json.task ?? "").toString();
    if (bundle) {
      const params =
        json.params && typeof json.params === "object"
          ? (json.params as Record<string, unknown>)
          : {};
      return { bundle, params };
    }
  }

  return { bundle: "task.idle_wander", params: {} };
}

function tryParseJson(line: string): Record<string, unknown> | null {
  if (!line.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(line);
    if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
  } catch {
    // not JSON
  }
  return null;
}
