import type { PlayManager } from "../index";
import { MOVEMENT_BEHAVIOR_NAMES } from "../behavior/catalog/factory";

export interface DebugCommandContext {
  text: string;
  isOwner: boolean;
  debugEnabled: boolean;
  playManager: PlayManager;
  groupId: number;
}

const OVERLAY_NAMES = ["defend", "auto_eat"];
const KNOWN_COMMANDS = new Set([
  "/join",
  "/exit",
  "/say",
  "/motion",
  "/stop",
  "/clear",
  "/status",
  "/behaviors",
  "/off",
]);

export function isDebugCommand(text: string): boolean {
  const head = text.trim().split(/\s+/)[0]?.toLowerCase();
  return !!head && KNOWN_COMMANDS.has(head);
}

function parseMotionArgs(arg: string): { behavior: string; params: Record<string, string> } {
  const parts = arg.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { behavior: "", params: {} };
  const behavior = parts[0].toLowerCase();
  const params: Record<string, string> = {};
  for (let i = 1; i < parts.length; i++) {
    const eq = parts[i].indexOf("=");
    if (eq > 0) params[parts[i].slice(0, eq)] = parts[i].slice(eq + 1);
  }
  return { behavior, params };
}

const MOVEMENT_HELP: Record<string, string> = {
  idle: "原地待机，偶尔张望",
  follow: "跟随玩家。参数: target=<玩家名> [distance=<格, 默认3>]",
  gather: "采集资源。参数: resource=<wood|stone|coal|iron>",
  farm_mobs: "猎杀附近被动生物获取掉落物",
  explore: "随机探索加载新区块",
};

const OVERLAY_HELP: Record<string, string> = {
  defend: "自动战斗。半径内有敌对生物时抢占移动去攻击。参数: [radius=<格, 默认8>]",
  auto_eat: "自动进食。饥饿且有食物且不在战斗时进食。",
};

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
      const s = pm.getActiveSession(groupId);
      if (!s) return "当前没有进行中的 mc 会话";
      if (!s.controller.isOnline()) return "bot 尚未连接到服务器";
      if (!arg) return motionUsage();
      const { behavior, params } = parseMotionArgs(arg);
      if (MOVEMENT_BEHAVIOR_NAMES.includes(behavior)) {
        s.setMovement({ behavior, params });
        return `移动行为: ${behavior} ${formatParams(params)}`.trim();
      }
      if (OVERLAY_NAMES.includes(behavior)) {
        const now = !s.isOverlayEnabled(behavior);
        s.toggleOverlay(behavior, now, params);
        return `${behavior} ${now ? "已开启" : "已关闭"}${now && Object.keys(params).length ? " " + formatParams(params) : ""}`.trim();
      }
      return `未知行为: ${behavior}\n${motionUsage()}`;
    }
    case "/stop": {
      const s = pm.getActiveSession(groupId);
      if (!s) return "当前没有进行中的 mc 会话";
      s.stopMovement();
      return "移动已停止，回到 idle（叠加状态保留）";
    }
    case "/clear": {
      const s = pm.getActiveSession(groupId);
      if (!s) return "当前没有进行中的 mc 会话";
      s.clearBehaviors();
      return "已清空所有状态，回到 idle";
    }
    case "/off": {
      const s = pm.getActiveSession(groupId);
      if (!s) return "当前没有进行中的 mc 会话";
      if (!arg) return "用法: /off <defend|auto_eat>";
      if (!OVERLAY_NAMES.includes(arg.toLowerCase())) return `未知叠加状态: ${arg}`;
      s.toggleOverlay(arg.toLowerCase(), false);
      return `${arg} 已关闭`;
    }
    case "/status": {
      const s = pm.getActiveSession(groupId);
      if (!s) return "当前没有进行中的 mc 会话";
      const st = s.getStatus();
      const elapsed = Math.floor((Date.now() - st.startedAt) / 1000);
      const states = s.getBehaviorStates();
      const on = states.filter((x) => x.enabled);
      const activeNow = states.find((x) => x.active);
      return [
        `服务器: ${st.serverName} | 状态: ${st.connected ? "已连接" : "未连接"}${s.debug ? " [debug]" : ""}`,
        `已游玩: ${Math.floor(elapsed / 60)}m${elapsed % 60}s | 当前执行: ${activeNow?.name ?? "none"}`,
        `已启用状态:`,
        ...on.map((x) => `  ${x.active ? "▶" : "○"} ${x.name} (${x.category}, P${x.priority})`),
      ].join("\n");
    }
    case "/behaviors": {
      return [
        "== 移动行为（同时只能有一个）==",
        ...MOVEMENT_BEHAVIOR_NAMES.map((n) => `- /motion ${n}${MOVEMENT_HELP[n] ? "  " + MOVEMENT_HELP[n] : ""}`),
        "",
        "== 叠加状态（可同时开启多个，按优先级抢占）==",
        ...OVERLAY_NAMES.map((n) => `- /motion ${n}  ${OVERLAY_HELP[n]}`),
        "",
        "生存层（常驻，无需开启）: escape_lava / mlg_fall / flee_creeper / escape_water",
      ].join("\n");
    }
    default:
      return null;
  }
}

function formatParams(params: Record<string, string>): string {
  return Object.entries(params).map(([k, v]) => `${k}=${v}`).join(" ");
}

function motionUsage(): string {
  return [
    "用法:",
    "  /motion <移动行为> [key=value ...]   设置移动行为",
    "  /motion <defend|auto_eat> [key=...] 切换叠加状态",
    "  /stop        停止移动（回 idle，叠加状态保留）",
    "  /clear       清空所有状态",
    "  /off <名称>  关闭指定叠加状态",
    "  /status      查看当前状态",
    "  /behaviors   列出所有行为",
    "",
    "移动行为: " + MOVEMENT_BEHAVIOR_NAMES.join(", "),
    "叠加状态: " + OVERLAY_NAMES.join(", "),
  ].join("\n");
}
