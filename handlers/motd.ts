import * as fs from "fs/promises";
import type { MessageEvent, MiokuContext, ScreenshotService } from "mioku";
import { pingMinecraftServer, type MotdStatus } from "../core/motd-ping";
import { toPlainMotdLines, parseMotd } from "../motd/parse";
import { buildMotdHtmlDocument } from "../motd/render";
import { VIEW_HEIGHT, VIEW_WIDTH } from "../motd/ui";

const RENDER_TIMEOUT_MS = 20_000;
const USAGE = "用法：/motd <服务器地址[:端口]>，例如 /motd play.example.com";

/** 查询服务器列表状态并回复截图 */
export async function handleMotd(
  ctx: MiokuContext,
  event: MessageEvent,
  rawAddress: string | undefined,
): Promise<void> {
  const address = normalizeAddress(rawAddress);
  if (!address) {
    await event.reply(USAGE);
    return;
  }

  const status = await pingMinecraftServer(address);
  ctx.logger.debug(
    `[MC] MOTD 查询 ${address} -> ${status.host}:${status.port} ${status.error ?? "ok"}`,
  );

  const imagePath = await renderMotdImage(ctx, status);
  if (imagePath) {
    await replyImage(ctx, event, imagePath);
    return;
  }
  await event.reply(fallbackText(status));
}

function normalizeAddress(raw: string | undefined): string | null {
  if (!raw) return null;
  const address = raw
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
    .replace(/\/.*$/, "")
    .trim();
  if (!address || /\s/.test(address)) return null;
  return address;
}

async function renderMotdImage(
  ctx: MiokuContext,
  status: MotdStatus,
): Promise<string | null> {
  const screenshotService = ctx.services?.screenshot as ScreenshotService | undefined;
  if (!screenshotService) {
    ctx.logger.warn("[MC] screenshot 服务未加载，MOTD 回退为文字");
    return null;
  }
  try {
    const html = await buildMotdHtmlDocument(status);
    const path = await withTimeout(
      Promise.resolve(
        screenshotService.screenshot(html, {
          width: VIEW_WIDTH,
          height: VIEW_HEIGHT,
          fullPage: true,
          type: "png",
        }),
      ),
      RENDER_TIMEOUT_MS,
    );
    return path || null;
  } catch (err) {
    ctx.logger.warn(`[MC] MOTD 截图失败: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

async function replyImage(
  ctx: MiokuContext,
  event: MessageEvent,
  imagePath: string,
): Promise<void> {
  try {
    await event.reply(ctx.segment.image(imagePath));
    return;
  } catch (err) {
    ctx.logger.debug(`[MC] MOTD 图片以路径发送失败，尝试 base64: ${err}`);
  }
  const buffer = await fs.readFile(imagePath);
  await event.reply(ctx.segment.image(`base64://${buffer.toString("base64")}`));
}

function fallbackText(status: MotdStatus): string {
  const lines = [`${status.host}:${status.port}`];
  if (status.error) {
    lines.push(`查询失败：${status.error}`);
    return lines.join("\n");
  }
  if (status.version?.name) lines.push(`版本：${status.version.name}`);
  if (status.players) {
    lines.push(`玩家：${status.players.online ?? 0}/${status.players.max ?? 0}`);
  }
  const motd = toPlainMotdLines(parseMotd(status.description))
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
  if (motd.length > 0) lines.push("MOTD：", ...motd);
  return lines.join("\n");
}

function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`截图服务 ${ms}ms 未返回`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
