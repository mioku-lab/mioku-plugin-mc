import type { AISkill } from "mioku";
import { getMcPlayState } from "./play/runtime";

const skill: AISkill = {
  name: "mc",
  description:
    "Let the bot enter or leave a Minecraft server so it can play alongside players. " +
    "The bot will then act on its own (explore, follow, fight, gather) until it decides to leave or its time runs out.",
  permission: "admin",
  tools: [
    {
      name: "control_bot",
      description:
        "Enter or exit a Minecraft server. Use action='enter' with a serverId to join; action='exit' to leave. " +
        "The bot autonomously decides its behavior once inside. Only call this when a group admin asks for it " +
        "or when continuing play makes sense.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["enter", "exit"],
            description: "'enter' to join a server, 'exit' to leave the current one.",
          },
          serverId: {
            type: "string",
            description: "The server id to enter. Required for 'enter', ignored for 'exit'.",
          },
        },
        required: ["action"],
      },
      handler: async (args: any, event?: any) => {
        const pm = getMcPlayState().playManager;
        if (!pm) return { error: "mc 游玩子系统未就绪" };

        const groupId = Number(event?.group_id);
        if (!Number.isFinite(groupId) || groupId <= 0) {
          return { error: "无法识别当前群，请在群聊中调用" };
        }

        const action = String(args?.action ?? "").toLowerCase();
        if (action === "exit") {
          const r = await pm.exit(groupId);
          return { success: r.success, message: r.message };
        }

        if (action !== "enter") {
          return { error: `未知 action: ${action}` };
        }

        const serverId = String(args?.serverId ?? "").trim();
        if (!serverId) return { error: "缺少 serverId" };

        const r = await pm.enter(groupId, serverId);
        return r.success
          ? { success: true, serverId: r.serverId, message: r.message }
          : { error: r.message };
      },
    },
  ],
};

export default skill;
