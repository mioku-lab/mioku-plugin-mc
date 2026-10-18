import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const BACKGROUND_FILE = "motd-bg.jpg";

let cached: Promise<string | null> | null = null;

/** 卡片背景图，读不到时返回 null 由调用方退回纯色 */
export function loadMotdBackground(): Promise<string | null> {
  cached ??= readBackground();
  return cached;
}

async function readBackground(): Promise<string | null> {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const file = join(here, "..", "assets", BACKGROUND_FILE);
    const buffer = await readFile(file);
    return `data:image/jpeg;base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}
