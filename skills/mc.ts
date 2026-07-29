import type { AISkill } from "mioku";
import type { PlayManager } from "../play";

export function createMcSkill(playManager: PlayManager): AISkill {
  return {
    name: "mc",
    description:
      "让机器人进入或离开 Minecraft 服务器，让它可以与玩家一起游玩。进入后机器人将自主行动（探索、跟随、战斗、收集），直到决定离开或时间耗尽。",
    permission: "admin",
    tools: [
      {
        name: "control_bot",
        description:
          "进入或退出 Minecraft 服务器。action='enter' + serverId 加入服务器；action='exit' 退出。机器人进入后会自主决定行为。仅在群管理员要求或继续游戏有意义时调用。",
        parameters: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["enter", "exit"],
              description: "'enter' 加入服务器，'exit' 退出当前服务器",
            },
            serverId: {
              type: "string",
              description: "要进入的服务器 ID。enter 时需要，exit 时忽略。",
            },
          },
          required: ["action"],
        },
        handler: async (args: any, runtimeCtx?: any) => {
          const event = runtimeCtx?.event || runtimeCtx?.rawEvent;
          const groupId = Number(event?.group_id);
          if (!Number.isFinite(groupId) || groupId <= 0) {
            return { error: "无法识别当前群，请在群聊中调用" };
          }

          const action = String(args?.action ?? "").toLowerCase();
          if (action === "exit") {
            const r = await playManager.exit(groupId);
            return { success: r.success, message: r.message };
          }

          if (action !== "enter") {
            return { error: `未知 action: ${action}` };
          }

          const serverId = String(args?.serverId ?? "").trim();
          if (!serverId) return { error: "缺少 serverId" };

          const r = await playManager.enter(groupId, serverId);
          return r.success
            ? { success: true, serverId: r.serverId, message: r.message }
            : { error: r.message };
        },
      },
    ],
  };
}
