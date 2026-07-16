import type { PlayManager } from "../index";

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
  "/play",
  "/exit",
  "/say",
  "/motion",
  "/stop",
  "/clear",
  "/status",
  "/behaviors",
  "/off",
  "/missions",
  "/actions",
  "/stopmission",
]);

export function isDebugCommand(text: string): boolean {
  const head = text.trim().split(/\s+/)[0]?.toLowerCase();
  return !!head && KNOWN_COMMANDS.has(head);
}

const OVERLAY_HELP: Record<string, string> = {
  defend: "自动战斗。半径内有敌对生物时抢占移动去攻击。参数: [radius=<格, 默认8>]",
  auto_eat: "自动进食。饥饿且有食物且不在战斗时进食。",
};

interface ParsedBundleArgs {
  bundle: string;
  params: Record<string, unknown>;
}

function parseBundleArgs(arg: string): ParsedBundleArgs | null {
  const trimmed = arg.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{")) {
    try {
      const obj = JSON.parse(trimmed);
      if (obj && typeof obj === "object" && typeof obj.bundle === "string") {
        return {
          bundle: obj.bundle,
          params:
            obj.params && typeof obj.params === "object"
              ? (obj.params as Record<string, unknown>)
              : {},
        };
      }
    } catch {
      return null;
    }
  }
  const parts = trimmed.split(/\s+/);
  const bundle = parts[0];
  if (!bundle.startsWith("task.")) return null;
  const params: Record<string, unknown> = {};
  for (let i = 1; i < parts.length; i++) {
    const eq = parts[i].indexOf("=");
    if (eq > 0) {
      const k = parts[i].slice(0, eq);
      const raw = parts[i].slice(eq + 1);
      const asNum = Number(raw);
      params[k] = Number.isFinite(asNum) && raw !== "" ? asNum : raw;
    }
  }
  return { bundle, params };
}

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
    case "/play": {
      if (!arg) return "用法: /play <服务器ID>";
      const r = await pm.enter(groupId, arg);
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
      if (OVERLAY_NAMES.includes(arg.toLowerCase().split(/\s+/)[0])) {
        const head2 = arg.toLowerCase().split(/\s+/)[0];
        const params: Record<string, string> = {};
        for (const p of arg.split(/\s+/).slice(1)) {
          const eq = p.indexOf("=");
          if (eq > 0) params[p.slice(0, eq)] = p.slice(eq + 1);
        }
        const enable = !s.isOverlayEnabled(head2);
        s.toggleOverlay(head2, enable, params);
        return `${head2} ${enable ? "已开启" : "已关闭"}${
          enable && Object.keys(params).length ? " " + formatParams(params) : ""
        }`.trim();
      }
      const parsed = parseBundleArgs(arg);
      if (!parsed) {
        return `无法解析参数: ${arg}\n${motionUsage()}`;
      }
      const result = s.startMission(parsed);
      if (result.kind === "applied") {
        return `任务已启动: ${result.bundleId} (mission=${result.missionId.slice(0, 8)})`;
      }
      return `任务被拒绝 (${result.reason}): ${result.detail}`;
    }
    case "/missions": {
      const s = pm.getActiveSession(groupId);
      if (!s) return "当前没有进行中的 mc 会话";
      const bundles = s.listBundles();
      const lines = [
        "== Task Bundles (startMission API) ==",
        ...bundles.map((b) => `- ${b.id} [${b.mode ?? "null"}]  ${b.description}`),
      ];
      const current = s.getCurrentMission();
      if (current) {
        lines.push(
          "",
          `当前任务: ${current.bundleId} (mission=${current.missionId.slice(0, 8)}, 启动于 ${new Date(current.startedAt).toLocaleTimeString()})`,
        );
      }
      return lines.join("\n");
    }
    case "/actions": {
      const s = pm.getActiveSession(groupId);
      if (!s) return "当前没有进行中的 mc 会话";
      return [
        "== Atomic Actions ==",
        ...s.listActions().map((action) => `- ${action.name}  ${action.description}`),
      ].join("\n");
    }
    case "/stopmission": {
      const s = pm.getActiveSession(groupId);
      if (!s) return "当前没有进行中的 mc 会话";
      const result = s.stopMission("debug_stop");
      if (result.kind === "applied") {
        return `任务已停止: ${result.bundleId}`;
      }
      return `停止失败 (${result.reason}): ${result.detail}`;
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
      const mem = s.getMemorySnapshot();
      const snap = s.getBehaviorSnapshot();
      const lastMissionOutcome = s.getLastMissionOutcome();
      const memLines = Object.entries(mem)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => {
          const valueStr = formatMemoryValue(v.value);
          return `  ${k}=${valueStr} (${v.ageMs}ms ago)`;
        });
      const snapLines = snap
        ? [
            `Mode: ${snap.mode.current} | Cooldowns: ${Object.keys(snap.cooldowns).length} pending`,
            `Active (internal state):`,
            ...snap.activeBehaviors
              .filter((x) => x.active)
              .map((x) => `  ▶ ${x.name}: ${formatMemoryValue(x.internalState)}`),
          ]
        : [`Snapshot: (engine not ready)`];
      const ws = st.workStatus;
      const workLine = ws
        ? `Work 状态: ${ws.running ? "运行中" : "空闲"} - ${ws.summary}${ws.progress ? ` (${ws.progress.current}/${ws.progress.target} ${ws.progress.unit})` : ""}`
        : "Work 状态: 未知";
      return [
        `服务器: ${st.serverName} | 状态: ${st.connected ? "已连接" : "未连接"}${s.debug ? " [debug]" : ""}`,
        `已游玩: ${Math.floor(elapsed / 60)}m${elapsed % 60}s | 当前执行: ${activeNow?.name ?? "none"}`,
        workLine,
        `最近任务结果: ${lastMissionOutcome ? `${lastMissionOutcome.status} ${lastMissionOutcome.bundleId}${lastMissionOutcome.code ? ` (${lastMissionOutcome.code})` : ""}` : "none"}`,
        `已启用状态:`,
        ...on.map((x) => `  ${x.active ? "▶" : "○"} ${x.name} (${x.category}, P${x.priority})`),
        ...snapLines,
        `Snapshot revisions: ${snap ? formatMemoryValue(snap.revisions) : "none"}`,
        `MemoryBus (${memLines.length} keys):`,
        ...memLines,
      ].join("\n");
    }
    case "/behaviors": {
      const s = pm.getActiveSession(groupId);
      if (!s) return "当前没有进行中的 mc 会话";
      const bundles = s.listBundles();
      return [
        "== 任务 Bundle (startMission API) ==",
        ...bundles.map((b) => `- ${b.id} [${b.mode ?? "null"}]  ${b.description}`),
        "",
        "== 叠加状态 (toggleOverlay) ==",
        ...OVERLAY_NAMES.map((n) => `- /motion ${n}  ${OVERLAY_HELP[n]}`),
        "",
        "生存层（常驻）: escape_lava / mlg_fall / flee_creeper / escape_water",
      ].join("\n");
    }
    default:
      return null;
  }
}

function formatParams(params: Record<string, string>): string {
  return Object.entries(params).map(([k, v]) => `${k}=${v}`).join(" ");
}

function formatMemoryValue(v: unknown): string {
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function motionUsage(): string {
  return [
    "用法:",
    '  /motion {"bundle":"task.follow_player","params":{"target":"Steve","distance":3}}',
    '  /motion task.follow_player target=Steve distance=3',
    "  /motion <defend|auto_eat> [key=value ...]  切换叠加状态",
    "  /stop              停止移动（回 idle，叠加状态保留）",
    "  /stopmission       停止当前任务",
    "  /clear             清空所有状态",
    "  /off <名称>        关闭指定叠加状态",
    "  /status            查看当前状态 + MemoryBus + Snapshot",
    "  /behaviors         列出所有任务 bundle",
    "  /missions          列出所有任务 bundle（含当前任务）",
    "  /actions           列出 Working AI 可用的一次性动作",
  ].join("\n");
}
