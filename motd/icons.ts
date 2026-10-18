const VIEW = 24;
// 顶面中心，RISE 到后顶点、HALF 到左顶点
const CX = 12;
const CY = 7.5;
const HALF = 10;
const RISE = 6;
const DROP = 10;

// 三个面的轮廓与 uv→面 的变换矩阵
const FACES = {
  top: {
    corners: `${CX - HALF},${CY} ${CX},${CY - RISE} ${CX + HALF},${CY} ${CX},${CY + RISE}`,
    matrix: `${HALF},${-RISE},${HALF},${RISE},${CX - HALF},${CY}`,
  },
  left: {
    corners: `${CX - HALF},${CY} ${CX},${CY + RISE} ${CX},${CY + RISE + DROP} ${CX - HALF},${CY + DROP}`,
    matrix: `${HALF},${RISE},0,${DROP},${CX - HALF},${CY}`,
  },
  right: {
    corners: `${CX},${CY + RISE} ${CX + HALF},${CY} ${CX + HALF},${CY + DROP} ${CX},${CY + RISE + DROP}`,
    matrix: `${HALF},${-RISE},0,${DROP},${CX},${CY + RISE}`,
  },
} as const;

type FaceName = keyof typeof FACES;

// 面上的像素噪点，坐标是 uv
interface Speck {
  u: number;
  v: number;
  w?: number;
  h?: number;
  fill: string;
  opacity?: number;
}

let clipSeed = 0;

function face(name: FaceName, fill: string, specks: Speck[] = []): string {
  const polygon = `<polygon points="${FACES[name].corners}" fill="${fill}"/>`;
  if (specks.length === 0) return polygon;
  clipSeed += 1;
  const id = `mc-clip-${clipSeed}`;
  const noise = specks
    .map(
      (s) =>
        `<rect x="${s.u}" y="${s.v}" width="${s.w ?? 0.2}" height="${s.h ?? 0.14}" fill="${s.fill}" opacity="${s.opacity ?? 0.5}"/>`,
    )
    .join("");
  // clip 与 transform 要分两层，否则 clip 会被 transform 带偏
  return `<defs><clipPath id="${id}"><polygon points="${FACES[name].corners}"/></clipPath></defs>${polygon}<g clip-path="url(#${id})"><g transform="matrix(${FACES[name].matrix})">${noise}</g></g>`;
}

function cube(faces: Partial<Record<FaceName, { fill: string; specks?: Speck[] }>>): string {
  const order: FaceName[] = ["top", "left", "right"];
  return order
    .filter((name) => faces[name])
    .map((name) => face(name, faces[name]!.fill, faces[name]!.specks ?? []))
    .join("");
}

// 草方块
const grassBlock = cube({
  top: {
    fill: "#6FBE45",
    specks: [
      { u: 0.1, v: 0.2, fill: "#8CD65C", opacity: 0.55 },
      { u: 0.55, v: 0.15, w: 0.3, fill: "#8CD65C", opacity: 0.45 },
      { u: 0.3, v: 0.6, w: 0.4, h: 0.2, fill: "#5AA337", opacity: 0.45 },
      { u: 0.7, v: 0.55, w: 0.25, fill: "#5AA337", opacity: 0.4 },
      { u: 0.05, v: 0.75, w: 0.2, fill: "#8CD65C", opacity: 0.35 },
    ],
  },
  left: {
    fill: "#96603B",
    specks: [
      { u: 0.25, v: 0.15, w: 0.35, h: 0.2, fill: "#7C4C2C", opacity: 0.6 },
      { u: 0.05, v: 0.45, w: 0.4, h: 0.25, fill: "#A96E44", opacity: 0.5 },
      { u: 0.6, v: 0.55, w: 0.35, h: 0.3, fill: "#7C4C2C", opacity: 0.5 },
      { u: 0.3, v: 0.8, w: 0.45, h: 0.18, fill: "#A96E44", opacity: 0.45 },
    ],
  },
  right: {
    fill: "#7A4C2D",
    specks: [
      { u: 0.35, v: 0.2, w: 0.4, h: 0.22, fill: "#8E5C37", opacity: 0.5 },
      { u: 0.05, v: 0.55, w: 0.5, h: 0.25, fill: "#663C22", opacity: 0.5 },
      { u: 0.5, v: 0.78, w: 0.4, h: 0.2, fill: "#8E5C37", opacity: 0.45 },
    ],
  },
});

// 命令方块
const commandBlock = cube({
  top: {
    fill: "#E0A054",
    specks: [
      { u: 0.35, v: 0.3, w: 0.3, h: 0.3, fill: "#F3D9A8", opacity: 0.75 },
      { u: 0.15, v: 0.15, fill: "#C7843B", opacity: 0.5 },
      { u: 0.7, v: 0.65, w: 0.2, fill: "#C7843B", opacity: 0.45 },
    ],
  },
  left: {
    fill: "#B9762F",
    specks: [
      { u: 0.2, v: 0.2, w: 0.35, h: 0.3, fill: "#E7B877", opacity: 0.6 },
      { u: 0.55, v: 0.5, w: 0.35, h: 0.25, fill: "#E7B877", opacity: 0.5 },
      { u: 0.1, v: 0.7, w: 0.3, h: 0.2, fill: "#8A5420", opacity: 0.5 },
    ],
  },
  right: {
    fill: "#985E22",
    specks: [
      { u: 0.3, v: 0.25, w: 0.4, h: 0.3, fill: "#C78A44", opacity: 0.5 },
      { u: 0.1, v: 0.65, w: 0.35, h: 0.22, fill: "#7A4715", opacity: 0.5 },
    ],
  },
});

// 玩家头颅：顶面头发、左面脸、右面耳朵侧
function headCube(skin: string, hair: string, dark: string): string {
  return cube({
    top: { fill: hair, specks: [{ u: 0.3, v: 0.3, w: 0.4, h: 0.3, fill: skin, opacity: 0.22 }] },
    left: {
      fill: skin,
      specks: [
        { u: 0, v: 0, w: 1, h: 0.26, fill: hair },
        { u: 0.12, v: 0.36, w: 0.26, h: 0.16, fill: "#FFFFFF", opacity: 0.92 },
        { u: 0.62, v: 0.36, w: 0.26, h: 0.16, fill: "#FFFFFF", opacity: 0.92 },
        { u: 0.24, v: 0.36, w: 0.14, h: 0.16, fill: "#3D5A8C", opacity: 0.95 },
        { u: 0.74, v: 0.36, w: 0.14, h: 0.16, fill: "#3D5A8C", opacity: 0.95 },
        { u: 0.34, v: 0.56, w: 0.32, h: 0.12, fill: dark, opacity: 0.5 },
        { u: 0.28, v: 0.76, w: 0.44, h: 0.1, fill: dark, opacity: 0.8 },
      ],
    },
    right: { fill: dark, specks: [{ u: 0.3, v: 0.35, w: 0.35, h: 0.35, fill: skin, opacity: 0.4 }] },
  });
}

const steveHead = headCube("#C68B60", "#3E2E22", "#9A6238");

// 延迟信号格，画布对齐参考稿的 39×24
const SIGNAL_WIDTH = 39;
const SIGNAL_HEIGHT = 24;
const SIGNAL_HEIGHTS = [7, 12, 17, 21];

export function renderSignal(lit: number, color: string, dim: string): string {
  const bars = SIGNAL_HEIGHTS.map((height, index) => {
    const active = index < lit;
    return `<rect x="${round(2 + index * 11)}" y="${23 - height}" width="7" height="${height}" rx="2" fill="${active ? color : dim}" opacity="${active ? 1 : 0.6}"/>`;
  }).join("");
  return `<svg class="mc-svg" viewBox="0 0 ${SIGNAL_WIDTH} ${SIGNAL_HEIGHT}" width="${SIGNAL_WIDTH}" height="${SIGNAL_HEIGHT}" fill="none" aria-hidden="true">${bars}</svg>`;
}

// 行首那枚更窄的信号图标
function rowSignal(): string {
  const heights = [6, 10, 14, 18];
  const bars = heights
    .map(
      (height, index) =>
        `<rect x="${round(1.4 + index * 5.6)}" y="${21 - height}" width="3.8" height="${height}" rx="1.3" fill="${index < 3 ? "#7FA8F5" : "#3D5C93"}"/>`,
    )
    .join("");
  return `<svg class="mc-svg mc-svg--glow" viewBox="0 0 24 24" width="24" height="24" fill="none" aria-hidden="true">${bars}</svg>`;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

// 只写路径，描边由外层 svg 统一给
const LINE_ICONS = {
  address: `
    <path d="M12 2.6 20.6 7.5v9L12 21.4 3.4 16.5v-9z"/>
    <path d="m3.4 7.5 8.6 4.9 8.6-4.9M12 12.4v9"/>
    <path d="M8.7 4.5 17.3 9.3"/>`,
  port: `
    <rect x="3" y="15.4" width="6" height="5.6" rx="1.2"/>
    <rect x="15" y="15.4" width="6" height="5.6" rx="1.2"/>
    <rect x="9" y="3" width="6" height="5.6" rx="1.2"/>
    <path d="M12 8.6v3.5M6 15.4v-1.6a1.4 1.4 0 0 1 1.4-1.4h9.2a1.4 1.4 0 0 1 1.4 1.4v1.6"/>`,
  copy: `
    <rect x="9" y="9" width="11" height="11" rx="2.2"/>
    <path d="M15 6.4v-.8A1.6 1.6 0 0 0 13.4 4H5.6A1.6 1.6 0 0 0 4 5.6v7.8A1.6 1.6 0 0 0 5.6 15h.8"/>`,
} as const;

type LineIconName = keyof typeof LINE_ICONS;
type StackIconName = "version" | "protocol" | "players";

export type MotdIconName = LineIconName | StackIconName | "latency";

const GLOWING: ReadonlySet<MotdIconName> = new Set(["address", "port", "latency"]);

const BLOCK_ICONS: Record<StackIconName, string> = {
  version: grassBlock,
  protocol: commandBlock,
  players: steveHead,
};

/** 状态行左侧图标 */
export function renderIcon(name: MotdIconName, size: number): string {
  if (name === "latency") {
    return rowSignal();
  }
  const glow = GLOWING.has(name) ? " mc-svg--glow" : "";
  const head = `<svg class="mc-svg${glow}" viewBox="0 0 ${VIEW} ${VIEW}" width="${size}" height="${size}" fill="none" aria-hidden="true"`;
  if (name === "version" || name === "protocol" || name === "players") {
    return `${head}>${BLOCK_ICONS[name]}</svg>`;
  }
  return `${head} stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${LINE_ICONS[name]}</svg>`;
}

/** 服务端没给 favicon 时的占位：草方块 */
export function renderGrassBlock(size: number): string {
  return `<svg class="mc-svg" viewBox="0 0 ${VIEW} ${VIEW}" width="${size}" height="${size}" fill="none" aria-hidden="true">${grassBlock}</svg>`;
}

/** 在线玩家头像，按名字换配色 */
export function renderAvatar(name: string, size: number, hue: number): string {
  const skin = `hsl(${hue} ${40 + (hue % 16)}% ${56 + (hue % 7)}%)`;
  const hair = `hsl(${(hue + 14) % 360} ${34 + (hue % 12)}% ${20 + (hue % 6)}%)`;
  const dark = `hsl(${hue} ${38 + (hue % 10)}% ${36 + (hue % 5)}%)`;
  return `<svg class="mc-svg" viewBox="0 0 ${VIEW} ${VIEW}" width="${size}" height="${size}" fill="none" aria-hidden="true">${headCube(skin, hair, dark)}</svg>`;
}

/** 名字映射到肤色区间的稳定色相 */
export function avatarHue(name: string): number {
  let value = 0;
  for (let i = 0; i < name.length; i += 1) value = (value * 31 + name.charCodeAt(i)) | 0;
  return 14 + (((value % 31) + 31) % 31);
}
