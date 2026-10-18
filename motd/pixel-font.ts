/**
 * 5×8 点阵字模，用于把服务器名渲染成 Minecraft 风格的像素字。
 * 每个字形 8 行、每行 5 列，bit0 是最右列；写成 8 个十六进制字节。
 * 第 0~6 行是基线以上的字身，第 7 行留给 g/j/p/q/y 的下伸部。
 */
const GLYPHS: Record<string, string> = {
  A: "0E11111F11111100",
  B: "1E11111E11111E00",
  C: "1E10101010101E00",
  D: "1E11111111111E00",
  E: "1F10101E10101F00",
  F: "1F10101E10101000",
  G: "0E11101711110E00",
  H: "1111111F11111100",
  I: "0E04040404040E00",
  J: "0702020202120C00",
  K: "1112141814121100",
  L: "1010101010101F00",
  M: "111B151111111100",
  N: "1119191513131100",
  O: "0E11111111110E00",
  P: "1E11111E10101000",
  Q: "0E11111115120D00",
  R: "1E11111E14121100",
  S: "0F10100E01011E00",
  T: "1F04040404040400",
  U: "1111111111110E00",
  V: "11111111110A0400",
  W: "11111111151B1100",
  X: "11110A040A111100",
  Y: "11110A0404040400",
  Z: "1F01020408101F00",
  a: "00000E010F110F00",
  b: "10101E1111111E00",
  c: "00000E1110110E00",
  d: "01010F1111110F00",
  e: "00000E111F100E00",
  f: "0608081E08080800",
  g: "00000F110F010E08",
  h: "10101E1111111100",
  i: "04000C0404040E00",
  j: "0200060202120C08",
  k: "1010121418141200",
  l: "0C04040404040E00",
  m: "00001A1515151500",
  n: "00001E1111111100",
  o: "00000E1111110E00",
  p: "00001E111E101000",
  q: "00000F110F010100",
  r: "0000161910101000",
  s: "00000F100E011E00",
  t: "08081E0808090600",
  u: "0000111111130D00",
  v: "00001111110A0400",
  w: "0000111115150A00",
  x: "0000110A040A1100",
  y: "000011110F010E00",
  z: "00001F0204081F00",
  "0": "0E11111111110E00",
  "1": "040C040404040E00",
  "2": "0E11010204081F00",
  "3": "1F02040201110E00",
  "4": "02060A121F020200",
  "5": "1F101E0101110E00",
  "6": "0608101E11110E00",
  "7": "1F01020408080800",
  "8": "0E11110E11110E00",
  "9": "0E11110F01020C00",
  "!": "0404040404000400",
  '"': "0A0A000000000000",
  "#": "000A1F0A1F0A0000",
  $: "040F140E051E0400",
  "%": "1112020408091100",
  "&": "0C12140815120D00",
  "'": "0404000000000000",
  "(": "0204080808040200",
  ")": "0804020202040800",
  "*": "000A041F040A0000",
  "+": "0004041F04040000",
  ",": "00000000000C0C08",
  "-": "0000000E00000000",
  ".": "00000000000C0C00",
  "/": "0101020408101000",
  ":": "000C0C000C0C0000",
  ";": "000C0C000C0C0008",
  "<": "0204081008040200",
  "=": "00001F001F000000",
  ">": "0804020102040800",
  "?": "0E11010204000400",
  "@": "0E11171517100E00",
  "[": "0E08080808080E00",
  "\\": "1010080402010100",
  "]": "0E02020202020E00",
  "^": "040A110000000000",
  _: "000000000000001F",
  "`": "0804000000000000",
  "{": "0604040804040600",
  "|": "0404040404040400",
  "}": "0C04040204040C00",
  "~": "0000081502000000",
};

/** 字形高度，第 7 行只在下伸字符上出现 */
export const PIXEL_ROWS = 8;
/** 字身高度，用于换算字号 */
export const PIXEL_CAP_ROWS = 7;
/** 空格宽度，比普通字形窄 */
const SPACE_ADVANCE = 4;
/** 字形之间留一列空隙 */
const GAP = 1;

interface Glyph {
  rows: number[];
  /** 字形实际占用的列数 */
  width: number;
  advance: number;
}

const cache = new Map<string, Glyph | null>();

function glyph(char: string): Glyph | null {
  if (cache.has(char)) return cache.get(char) ?? null;

  let value: Glyph | null = null;
  if (char === " ") {
    value = { rows: new Array(PIXEL_ROWS).fill(0), width: 3, advance: SPACE_ADVANCE };
  } else {
    const encoded = GLYPHS[char];
    if (encoded && encoded.length === PIXEL_ROWS * 2) {
      const rows: number[] = [];
      for (let i = 0; i < PIXEL_ROWS; i += 1) {
        rows.push(parseInt(encoded.slice(i * 2, i * 2 + 2), 16));
      }
      const width = measureWidth(rows);
      value = { rows, width, advance: width + GAP };
    }
  }
  cache.set(char, value);
  return value;
}

/** 字模里 bit4 是最左列，bit0 是最右列 */
function bit(col: number): number {
  return 1 << (4 - col);
}

/** 取最右侧有点的一列，让窄字母（i、l、t）自然收敛 */
function measureWidth(rows: number[]): number {
  let width = 0;
  for (const row of rows) {
    for (let col = 4; col >= 0; col -= 1) {
      if (row & bit(col)) {
        if (col + 1 > width) width = col + 1;
        break;
      }
    }
  }
  return Math.max(width, 1);
}

/** 只有全部字符都有字模时才用像素字，否则整串退回系统字体 */
export function supportsPixelText(text: string): boolean {
  if (!text) return false;
  for (const char of text) {
    if (!glyph(char)) return false;
  }
  return true;
}

/** 文本按点阵排布后的总列数，用来判断能放多大 */
export function measurePixelText(text: string): number {
  let total = 0;
  for (const char of text) total += glyph(char)?.advance ?? SPACE_ADVANCE;
  return Math.max(total - GAP, 0);
}

export interface PixelTextOptions {
  /** 单个像素点的横向边长（px），比 unitY 小就是压扁的字宽 */
  unitX: number;
  /** 单个像素点的纵向边长（px） */
  unitY: number;
  color: string;
}

/** 把文本渲染成 SVG 像素字，宽度按内容自适应 */
export function renderPixelText(text: string, options: PixelTextOptions): string {
  const glyphs = Array.from(text, (char) => glyph(char));
  const totalUnits =
    glyphs.reduce((sum, item) => sum + (item?.advance ?? SPACE_ADVANCE), 0) - GAP;
  if (totalUnits <= 0) return "";

  const { unitX, unitY } = options;

  const path: string[] = [];
  let cursor = 0;
  for (const item of glyphs) {
    if (item) {
      for (let row = 0; row < PIXEL_ROWS; row += 1) {
        for (let col = 0; col < item.width; col += 1) {
          if (item.rows[row] & bit(col)) {
            path.push(`M${cursor + col} ${row}h1v1h-1z`);
          }
        }
      }
      cursor += item.advance;
    } else {
      cursor += SPACE_ADVANCE;
    }
  }

  const width = totalUnits * unitX;
  const height = PIXEL_ROWS * unitY;
  return `<svg class="mc-pixel" viewBox="0 0 ${totalUnits} ${PIXEL_ROWS}" preserveAspectRatio="none" width="${round(width)}" height="${round(height)}" aria-hidden="true"><path d="${path.join("")}" fill="${options.color}"/></svg>`;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
