import type { McConfig, McEvent } from "../types";

export function formatMcEvent(event: McEvent, config: McConfig): string | null {
  const { sub_type, player, message, server_name } = event;

  const sayWord = config.say_way || "说：";
  const playerName = player?.nickname || "未知玩家";

  let body: string | null = null;

  switch (sub_type) {
    case "player_join":
      body = `${playerName} 加入了游戏`;
      break;
    case "player_quit":
      body = `${playerName} 退出了游戏`;
      break;
    case "player_death":
      body =
        event.death?.text ||
        event.death?.translate?.text ||
        `${playerName} 死亡了`;
      break;
    case "player_command":
      body = `${playerName} 使用命令 ${event.command || ""}`.trim();
      break;
    case "player_achievement": {
      const titleRaw =
        event.achievement?.translate?.text ||
        event.achievement?.text ||
        event.achievement?.display?.title?.text ||
        event.achievement?.display?.title?.translate?.text ||
        event.achievement?.display?.title;
      const title = typeof titleRaw === "string" ? titleRaw : null;
      if (title) {
        body =
          event.achievement?.translate?.text || event.achievement?.text
            ? title
            : `${playerName} 达成了进度 ${title}`;
      }
      break;
    }
    case "player_chat": {
      const content = message || extractText(event.raw_message);
      if (content) {
        body = `${playerName} ${sayWord} ${content}`.trim();
      }
      break;
    }
    default:
      return null;
  }

  if (!body) return null;

  if (!config.display_server_name) return body;
  const name = server_name || "未知服务器";
  return `[${name}] ${body}`;
}

function extractText(raw: unknown): string {
  if (!raw) return "";
  if (typeof raw === "string") return raw.trim();
  if (typeof raw !== "object") return String(raw);

  const obj = raw as Record<string, unknown>;
  if (typeof obj.text === "string") return obj.text;
  if (typeof obj.translate === "string") return obj.translate;

  const withArr = Array.isArray(obj.with) ? obj.with : [];
  if (withArr.length > 0) {
    return withArr.map((w) => (typeof w === "string" ? w : "")).join("");
  }

  return "";
}

export function formatQqToMc(
  sender: { nickname?: string; card?: string; user_id?: number | string },
  messageArr: Array<{ type: string; text?: string; url?: string }>,
  config: McConfig,
  serverItem: { mc_qq_chat_image_enable?: boolean },
): Array<{ text: string; color?: string }> {
  const result: Array<{ text: string; color?: string }> = [];
  const sayWord = config.say_way || "说：";

  const nick =
    sender.nickname || sender.card || String(sender.user_id ?? "未知用户");

  result.push({ text: nick, color: "green" });
  result.push({ text: ` ${sayWord} `, color: "white" });

  for (const msg of messageArr) {
    if (msg.type === "text") {
      result.push({
        text: String(msg.text ?? "")
          .replace(/\r/g, "")
          .replace(/\n/g, "\n * "),
        color: "white",
      });
    } else if (msg.type === "image") {
      const imageUrl = String(msg.url || "");
      if (serverItem.mc_qq_chat_image_enable) {
        result.push({ text: `[[CICode,url=${imageUrl},name=图片]]` });
      } else {
        result.push({ text: "[图片]", color: "light_purple" });
      }
    } else {
      result.push({
        text: `[${msg.type}] ${msg.text || ""}`.trim(),
        color: "white",
      });
    }
  }

  return result;
}
