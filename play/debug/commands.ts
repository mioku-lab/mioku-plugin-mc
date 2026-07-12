import type { PlayManager } from "../index";
import type { BehaviorSpec } from "../types";

export interface DebugCommandContext {
  text: string;
  isOwner: boolean;
  debugEnabled: boolean;
  playManager: PlayManager;
  groupId: number;
}

const KNOWN_COMMANDS = new Set([
  "/join",
  "/exit",
  "/say",
  "/motion",
  "/stop",
  "/status",
  "/behaviors",
]);

export function isDebugCommand(text: string): boolean {
  const head = text.trim().split(/\s+/)[0]?.toLowerCase();
  return !!head && KNOWN_COMMANDS.has(head);
}

function parseMotionSpec(arg: string): BehaviorSpec {
  const parts = arg.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { behavior: "idle", params: {} };
  const behavior = parts[0].toLowerCase().replace(/^behavior=/, "");
  const params: Record<string, string> = {};
  for (let i = 1; i < parts.length; i++) {
    const eq = parts[i].indexOf("=");
    if (eq > 0) params[parts[i].slice(0, eq)] = parts[i].slice(eq + 1);
  }
  return { behavior, params };
}

const AVAILABLE_BEHAVIORS = [
  "idle",
  "follow target=<玩家名> [distance=<格>]",
  "defend [radius=<格>]",
  "follow_assist target=<玩家名>",
  "gather resource=<wood|stone|food|coal|iron>",
  "farm_mobs",
  "guard [x=<int> y=<int> z=<int>] [radius=<格>]",
  "socialize",
  "flee",
  "explore",
];

export async function handleDebugCommand(
  ctx: DebugCommandContext,
): Promise<string | null> {
  if (!ctx.debugEnabled || !ctx.isOwner) return null;
  const text = ctx.text.trim();
  if (!text.startsWith("/")) return null;
  const head = text.split(/\s+/)[0]?.toLowerCase();
  if (!head || !KNOWN_COMMANDS.has(head)) return null;

  const arg = text.slice(head.length).trim();
  const pm = ctx.playManager;
  const groupId = ctx.groupId;

  switch (head) {
    case "/join": {
      if (!arg) return "用法: /join <服务器ID>";
      const r = await pm.enter(groupId, arg, { debug: true });
      return r.message;
    }
    case "/exit": {
      const r = await pm.exit(groupId);
      return r.message;
    }
    case "/say": {
      if (!arg) return "用法: /say <要说的话>";
      const s = pm.getActiveSession(groupId);
      if (!s) return "当前没有进行中的 mc 会话";
      if (!s.controller.isOnline()) return "bot 尚未连接到服务器";
      s.say(arg);
      return `已发送: ${arg}`;
    }
    case "/motion": {
      if (!arg) return "用法: /motion <behavior> [key=value ...]\n例如: /motion follow target=Steve distance=3";
      const s = pm.getActiveSession(groupId);
      if (!s) return "当前没有进行中的 mc 会话";
      if (!s.controller.isOnline()) return "bot 尚未连接到服务器";
      const spec = parseMotionSpec(arg);
      s.setBehavior(spec);
      return `行为已切换: ${spec.behavior} ${Object.entries(spec.params).map(([k, v]) => `${k}=${v}`).join(" ")}`.trim();
    }
    case "/stop": {
      const s = pm.getActiveSession(groupId);
      if (!s) return "当前没有进行中的 mc 会话";
      s.stopBehavior();
      return "已回到 idle";
    }
    case "/status": {
      const s = pm.getActiveSession(groupId);
      if (!s) return "当前没有进行中的 mc 会话";
      const st = s.getStatus();
      const elapsed = Math.floor((Date.now() - st.startedAt) / 1000);
      const min = Math.floor(elapsed / 60);
      const sec = elapsed % 60;
      return [
        `服务器: ${st.serverName} (${st.serverId})`,
        `群: ${st.groupId}  bot: ${st.botSelfId}`,
        `状态: ${st.connected ? "已连接" : "未连接"}${s.debug ? "  [debug]" : ""}`,
        `当前行为: ${st.currentBehavior ?? "none"}`,
        `已游玩: ${min}m${sec}s`,
      ].join("\n");
    }
    case "/behaviors": {
      return (
        "可用行为:\n" +
        AVAILABLE_BEHAVIORS.map((b) => `- /motion ${b}`).join("\n")
      );
    }
    default:
      return null;
  }
}
