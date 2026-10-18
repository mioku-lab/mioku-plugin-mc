import type { MotdComponent } from "../core/motd-ping";

/** 一段同样式文本 */
export interface MotdSpan {
  text: string;
  /** 原始颜色代码，渲染时再映射为色值 */
  color: string;
  bold: boolean;
  italic: boolean;
  underlined: boolean;
  strikethrough: boolean;
}

export interface MotdLine {
  spans: MotdSpan[];
}

const DEFAULT_COLOR = "gray";

/** 16 种基础色 + 常见别名，键统一小写 */
export const MOTD_COLORS: Record<string, string> = {
  black: "#000000",
  dark_blue: "#0000AA",
  dark_green: "#00AA00",
  dark_aqua: "#00AAAA",
  dark_red: "#AA0000",
  dark_purple: "#AA00AA",
  gold: "#FFAA00",
  gray: "#AAAAAA",
  grey: "#AAAAAA",
  dark_gray: "#555555",
  dark_grey: "#555555",
  blue: "#5555FF",
  green: "#55FF55",
  aqua: "#55FFFF",
  red: "#FF5555",
  light_purple: "#FF55FF",
  yellow: "#FFFF55",
  white: "#FFFFFF",
};

interface Style {
  color: string;
  bold: boolean;
  italic: boolean;
  underlined: boolean;
  strikethrough: boolean;
}

function defaultStyle(): Style {
  return {
    color: DEFAULT_COLOR,
    bold: false,
    italic: false,
    underlined: false,
    strikethrough: false,
  };
}

function sameStyle(a: Style, b: Style): boolean {
  return (
    a.color === b.color &&
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.underlined === b.underlined &&
    a.strikethrough === b.strikethrough
  );
}

function pushSpan(line: MotdLine, text: string, style: Style) {
  if (!text) return;
  const last = line.spans.at(-1);
  if (last && sameStyle(last, style)) {
    last.text += text;
    return;
  }
  line.spans.push({ text, ...style });
}

/** 把服务端返回的 description 解析为按行分组的样式片段 */
export function parseMotd(description: MotdComponent | undefined): MotdLine[] {
  if (description === undefined || description === null) return [];
  const lines: MotdLine[] = [{ spans: [] }];
  walk(description, defaultStyle(), (text, style) => {
    const parts = text.replace(/\r/g, "").split("\n");
    for (let i = 0; i < parts.length; i += 1) {
      if (i > 0) lines.push({ spans: [] });
      // 换行会重置样式，与原版客户端一致
      pushSpan(lines.at(-1) as MotdLine, parts[i], i > 0 ? defaultStyle() : style);
    }
  });
  return trimEmpty(lines);
}

/** 解析带旧版 § 代码的纯文本，例如玩家列表样例 */
export function parseLegacyText(text: string): MotdSpan[] {
  const line: MotdLine = { spans: [] };
  emitLegacy(text.replace(/\r?\n/g, " "), defaultStyle(), (value, style) => {
    pushSpan(line, value, style);
  });
  return line.spans;
}

function trimEmpty(lines: MotdLine[]): MotdLine[] {
  while (lines.length > 0 && lines[0].spans.length === 0) lines.shift();
  while (lines.length > 0 && (lines.at(-1) as MotdLine).spans.length === 0) {
    lines.pop();
  }
  return lines;
}

function walk(
  component: MotdComponent,
  inherited: Style,
  emit: (text: string, style: Style) => void,
) {
  if (typeof component === "string") {
    emitLegacy(component, inherited, emit);
    return;
  }
  if (Array.isArray(component)) {
    for (const child of component) walk(child, inherited, emit);
    return;
  }
  if (!component || typeof component !== "object") return;

  const ownStyle = resolveStyle(component, inherited);
  const text = component.text ?? component.translate ?? "";
  if (text) emitLegacy(String(text), ownStyle, emit);

  const withParts = component.with;
  if (Array.isArray(withParts)) {
    for (const part of withParts) walk(part, ownStyle, emit);
  }
  const extra = component.extra;
  if (Array.isArray(extra)) {
    for (const child of extra) walk(child, ownStyle, emit);
  }
}

function resolveStyle(
  component: Exclude<MotdComponent, string | MotdComponent[]>,
  inherited: Style,
): Style {
  const style: Style = { ...inherited };
  const color = typeof component.color === "string" ? component.color.toLowerCase() : "";
  if (color === "reset") {
    Object.assign(style, defaultStyle());
  } else if (MOTD_COLORS[color]) {
    style.color = color;
  }
  if (component.bold !== undefined) style.bold = Boolean(component.bold);
  if (component.italic !== undefined) style.italic = Boolean(component.italic);
  if (component.underlined !== undefined) style.underlined = Boolean(component.underlined);
  if (component.strikethrough !== undefined) {
    style.strikethrough = Boolean(component.strikethrough);
  }
  return style;
}

const LEGACY_CODES: Record<string, string> = {
  "0": "black",
  "1": "dark_blue",
  "2": "dark_green",
  "3": "dark_aqua",
  "4": "dark_red",
  "5": "dark_purple",
  "6": "gold",
  "7": "gray",
  "8": "dark_gray",
  "9": "blue",
  a: "green",
  b: "aqua",
  c: "red",
  d: "light_purple",
  e: "yellow",
  f: "white",
};

/** 处理旧版 § 代码；无代码时直接按继承样式输出 */
function emitLegacy(
  text: string,
  inherited: Style,
  emit: (text: string, style: Style) => void,
) {
  if (!text.includes("\u00a7")) {
    emit(text, inherited);
    return;
  }

  const style: Style = { ...inherited };
  let buffer = "";
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char !== "\u00a7" || i + 1 >= text.length) {
      buffer += char;
      continue;
    }
    const code = text[i + 1].toLowerCase();
    const color = LEGACY_CODES[code];
    if (!color && !"klmnor".includes(code)) {
      buffer += char;
      continue;
    }
    if (buffer) {
      emit(buffer, style);
      buffer = "";
    }
    i += 1;
    if (color) {
      style.color = color;
      style.bold = false;
      style.italic = false;
      style.underlined = false;
      style.strikethrough = false;
    } else if (code === "l") style.bold = true;
    else if (code === "m") style.strikethrough = true;
    else if (code === "n") style.underlined = true;
    else if (code === "o") style.italic = true;
    else if (code === "r") Object.assign(style, defaultStyle());
    // k（乱码）与截图无关，直接忽略
  }
  if (buffer) emit(buffer, style);
}

/** 面向通知文本的纯文本 MOTD，用于图片生成失败时兜底 */
export function toPlainMotdLines(lines: MotdLine[]): string[] {
  return lines.map((line) => line.spans.map((span) => span.text).join(""));
}
