import type { MotdStatus } from "../core/motd-ping";
import { loadMotdBackground } from "./background";
import {
  avatarHue,
  renderAvatar,
  renderIcon,
  renderGrassBlock,
  renderSignal,
  type MotdIconName,
} from "./icons";
import {
  MOTD_COLORS,
  parseLegacyText,
  parseMotd,
  type MotdLine,
  type MotdSpan,
} from "./parse";
import { measurePixelText, renderPixelText, supportsPixelText } from "./pixel-font";
import {
  LAYOUT,
  NAME_UNIT_MIN,
  NAME_UNIT_X,
  NAME_UNIT_Y,
  UI,
  UI_CSS,
  VIEW_WIDTH,
} from "./ui";

const DEFAULT_SPAN_COLOR = "#AAAAAA";
const NAME_LIMIT = 200;
const MAX_AVATARS = 6;

const SOFTWARE_LABELS: Array<[RegExp, string]> = [
  [/leaves/i, "Leaves"],
  [/purpur/i, "Purpur"],
  [/pufferfish/i, "Pufferfish"],
  [/paper/i, "Paper"],
  [/velocity/i, "Velocity"],
  [/waterfall/i, "Waterfall"],
  [/bungeecord/i, "BungeeCord"],
  [/spigot/i, "Spigot"],
  [/bukkit/i, "Bukkit"],
  [/fabric/i, "Fabric"],
  [/forge/i, "Forge"],
  [/folia/i, "Folia"],
  [/sponge/i, "Sponge"],
];

interface StatRow {
  icon: MotdIconName;
  label: string;
  value: string;
  copy?: boolean;
  /** 分隔线画在这一行上方 */
  split?: boolean;
  /** 值偏长时降一档字号，避免换行把行高撑破 */
  dense?: boolean;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function buildMotdHtmlDocument(status: MotdStatus): Promise<string> {
  const background = await loadMotdBackground();
  const bgStyle = background
    ? ` style="background-image:url(&quot;${background}&quot;)"`
    : "";
  return `<style>${UI_CSS}</style>
<div class="mc-page">
  <div class="mc-bg"${bgStyle}></div>
  <div class="mc-scrim"></div>
  <div class="mc-card">
    ${renderIconBox(status)}
    ${renderHead(status)}
    <div class="mc-side">
      ${renderStats(status)}
      ${renderError(status)}
    </div>
  </div>
</div>`;
}

/** 头部：MOTD 首行当服务器名，第二行当副标题，其余行当介绍 */
function renderHead(status: MotdStatus): string {
  const lines = status.error ? [] : parseMotd(status.description);
  const nameLine = lines[0];
  const taglineLine = lines[1];
  const descLines = lines.slice(2);

  const name = nameLine
    ? linePlainText(nameLine).trim()
    : status.host;
  const tagline = taglineLine
    ? linePlainText(taglineLine).trim()
    : defaultTagline(status);

  return `${renderName(name || status.host)}
  <div class="mc-tagline">${escapeHtml(tagline)}</div>
  <div class="mc-desc">${descLines.map(renderLine).join("<br />")}</div>`;
}

/** ASCII 名字走点阵字，中文等字符退回系统字体，保证不出现豆腐块 */
function renderName(name: string): string {
  const text = `<div class="mc-name mc-name--text">${escapeHtml(name)}</div>`;
  if (!supportsPixelText(name)) return text;
  const maxWidth = VIEW_WIDTH - LAYOUT.textLeft - 60;
  const totalUnits = measurePixelText(name);
  const scale = Math.min(1, maxWidth / (totalUnits * NAME_UNIT_X));
  // 太长的名字挤成一点点阵反而看不清，直接换系统字体做省略号
  if (NAME_UNIT_Y * scale < NAME_UNIT_MIN) return text;
  const svg = renderPixelText(name, {
    unitX: NAME_UNIT_X * scale,
    unitY: NAME_UNIT_Y * scale,
    color: UI.title,
  });
  return `<div class="mc-name">${svg}</div>`;
}

function renderIconBox(status: MotdStatus): string {
  const src = toIconSrc(status.favicon);
  if (src) return `<img class="mc-icon" src="${escapeHtml(src)}" alt="" />`;
  return `<div class="mc-icon mc-icon--empty">${renderGrassBlock(LAYOUT.iconSize)}</div>`;
}

/** favicon 是 data URL；少数服务端只给裸 base64，这里补齐前缀 */
function toIconSrc(favicon: string | undefined): string | null {
  if (!favicon) return null;
  const value = favicon.trim();
  if (/^data:image\//i.test(value)) return value;
  if (value.length > 64 && /^[A-Za-z0-9+/=]+$/.test(value)) {
    return `data:image/png;base64,${value}`;
  }
  return null;
}

function renderStats(status: MotdStatus): string {
  const protocol = status.version?.protocol;
  const software = detectSoftware(status, motdPlainText(status));
  const versionValue = {
    name: status.version?.name?.trim() || "未知版本",
    badge: software ? renderBadge(software) : "",
  };

  const rows: StatRow[] = [
    {
      icon: "address",
      label: "Address",
      value: textValue(status.host),
      copy: true,
      dense: status.host.length > 26,
    },
    { icon: "port", label: "Port", value: textValue(String(status.port)), copy: true },
  ];

  if (!status.error) {
    rows.push({
      icon: "version",
      label: "Version",
      value: `<span class="mc-version"><span class="mc-text">${escapeHtml(versionValue.name)}</span>${versionValue.badge}</span>`,
      split: true,
    });
    rows.push({
      icon: "protocol",
      label: "Protocol",
      value: textValue(protocol === undefined ? "—" : String(protocol)),
    });
    rows.push({ icon: "players", label: "Players", value: renderPlayers(status) });
    rows.push({ icon: "latency", label: "Latency", value: renderLatency(status.latencyMs) });
  }

  return `<div class="mc-stats">${rows.map(renderStatRow).join("")}</div>`;
}

/** 纯文本值统一包一层，过长时由 .mc-text 截断 */
function textValue(value: string): string {
  return `<span class="mc-text">${escapeHtml(value)}</span>`;
}

function renderStatRow(row: StatRow): string {
  return `<div class="mc-stat${row.split ? " mc-stat--split" : ""}">
  <span class="mc-stat__icon">${renderIcon(row.icon, LAYOUT.statIconSize)}</span>
  <span class="mc-stat__label">${row.label}</span>
  <span class="mc-stat__value${row.dense ? " mc-stat__value--sm" : ""}">${row.value}</span>
  ${row.copy ? `<span class="mc-stat__copy">${renderIcon("copy", 20)}</span>` : ""}
</div>`;
}

function renderBadge(software: string): string {
  return `<span class="mc-badge"><svg viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="m1.6 7.6 3.6 3.8L12.4 2.8"/></svg>${escapeHtml(software)}</span>`;
}

function renderPlayers(status: MotdStatus): string {
  const online = status.players?.online ?? 0;
  const max = status.players?.max ?? 0;
  const names = status.players?.names ?? [];
  const avatars = renderAvatars(names);
  const people = avatars
    ? `<span class="mc-players__people"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.1"/><path d="M3.6 19.4a5.4 5.4 0 0 1 10.8 0"/><path d="M16.1 5.6a3.1 3.1 0 0 1 0 6M17.4 14.4a5.4 5.4 0 0 1 3 4.9"/></svg></span>`
    : "";
  return `<span class="mc-players">
    <span class="mc-players__count">${online} / ${max}</span>
    ${people}
    ${avatars}
  </span>`;
}

function renderAvatars(names: string[]): string {
  const shown: string[] = [];
  let used = 0;
  for (const name of names) {
    if (shown.length >= MAX_AVATARS) break;
    const text = parseLegacyText(name)
      .map((span) => span.text)
      .join("")
      .trim();
    if (!text) continue;
    // 部分服务端在 sample 里塞排队/公告文案，玩家名不含冒号
    if (text.includes(":")) continue;
    if (used + text.length > NAME_LIMIT) break;
    used += text.length;
    shown.push(text);
  }
  if (shown.length === 0) return "";
  const chips = shown
    .map(
      (name) =>
        `<span class="mc-avatar">${renderAvatar(escapeHtml(name), 26, avatarHue(name))}</span>`,
    )
    .join("");
  const hidden = names.length - shown.length;
  const more = hidden > 0 ? `<span class="mc-avatar mc-avatar--more">+${hidden}</span>` : "";
  return `<span class="mc-avatars">${chips}${more}</span>`;
}

function renderLatency(latencyMs: number | undefined): string {
  const signal = renderSignal(
    latencyMs === undefined || latencyMs < 0 ? 0 : signalBars(latencyMs),
    UI.greenDim,
    "rgba(63, 167, 106, 0.32)",
  );
  if (latencyMs === undefined || latencyMs < 0) {
    return `<span class="mc-latency"><span class="mc-latency__value mc-latency__value--unknown">—</span>${signal}</span>`;
  }
  const tone =
    latencyMs < 150 ? "" : latencyMs < 300 ? " mc-latency__value--warn" : " mc-latency__value--bad";
  return `<span class="mc-latency"><span class="mc-latency__value${tone}">${latencyMs} ms</span>${signal}</span>`;
}

function renderError(status: MotdStatus): string {
  if (!status.error) return "";
  return `<div class="mc-panel-error">${escapeHtml(status.error)}，请确认地址与端口是否正确，或稍后重试</div>`;
}

function renderLine(line: MotdLine): string {
  return renderSpans(line.spans);
}

function renderSpans(spans: MotdSpan[]): string {
  return spans
    .map((span) => {
      const styles = [`color:${resolveColor(span.color)}`];
      if (span.bold) styles.push("font-weight:700");
      if (span.italic) styles.push("font-style:italic");
      const decorations: string[] = [];
      if (span.underlined) decorations.push("underline");
      if (span.strikethrough) decorations.push("line-through");
      if (decorations.length > 0) styles.push(`text-decoration:${decorations.join(" ")}`);
      return `<span style="${styles.join(";")}">${escapeHtml(span.text)}</span>`;
    })
    .join("");
}

/** 只取第一行的纯文本，用于头像与名字 */
function linePlainText(line: MotdLine): string {
  return line.spans.map((span) => span.text).join("");
}

function defaultTagline(status: MotdStatus): string {
  return status.error ? "无法连接" : "A Minecraft Server";
}

/** 版本名常常只写裸版本号，服务端软件多在 MOTD 首行里自报 */
function detectSoftware(status: MotdStatus, motdText: string): string | null {
  const sources = [status.version?.name ?? "", motdText];
  for (const source of sources) {
    for (const [pattern, label] of SOFTWARE_LABELS) {
      if (pattern.test(source)) return label;
    }
  }
  return null;
}

function motdPlainText(status: MotdStatus): string {
  const lines = parseMotd(status.description).map((line) =>
    line.spans.map((span) => span.text).join(""),
  );
  return lines[0] ?? "";
}

function resolveColor(color: string): string {
  const key = color.toLowerCase();
  if (/^#[0-9a-f]{3,8}$/.test(key)) return key;
  return MOTD_COLORS[key] ?? DEFAULT_SPAN_COLOR;
}

function signalBars(latency: number): number {
  if (latency < 80) return 4;
  if (latency < 150) return 3;
  if (latency < 300) return 2;
  return 1;
}
