import net from "net";
import { z } from "zod";
import { resolveMinecraftEndpoint } from "../play/util/endpoint";

const TIMEOUT_MS = 8_000;
const MAX_FRAME_BYTES = 4 * 1024 * 1024;
const HANDSHAKE_STATE_STATUS = 1;
// 1.21.1，服务端只会用它决定 status 里的版本展示
const DEFAULT_PROTOCOL_VERSION = 767;

const chatComponentSchema: z.ZodType<MotdComponent> = z.lazy(() =>
  z.union([
    z.string(),
    z.array(chatComponentSchema),
    z
      .object({
        text: z.string().optional(),
        translate: z.string().optional(),
        color: z.string().optional(),
        bold: z.boolean().optional(),
        italic: z.boolean().optional(),
        underlined: z.boolean().optional(),
        strikethrough: z.boolean().optional(),
        obfuscated: z.boolean().optional(),
        extra: z.array(chatComponentSchema).optional(),
        with: z.array(chatComponentSchema).optional(),
      })
      .passthrough(),
  ]),
);

const statusSchema = z.object({
  // 由 queryStatus 注入，不来自服务端响应
  __latencyMs: z.number().optional(),
  version: z
    .object({
      name: z.string().optional(),
      protocol: z.number().optional(),
    })
    .optional(),
  players: z
    .object({
      online: z.number().optional(),
      max: z.number().optional(),
      sample: z
        .array(z.object({ name: z.string().optional() }).passthrough())
        .optional(),
    })
    .optional(),
  description: chatComponentSchema.optional(),
  favicon: z.string().optional(),
});

export type MotdComponent =
  | string
  | MotdComponent[]
  | {
      text?: string;
      translate?: string;
      color?: string;
      bold?: boolean;
      italic?: boolean;
      underlined?: boolean;
      strikethrough?: boolean;
      obfuscated?: boolean;
      extra?: MotdComponent[];
      with?: MotdComponent[];
      [key: string]: unknown;
    };

export interface MotdVersion {
  name?: string;
  protocol?: number;
}

export interface MotdPlayers {
  online?: number;
  max?: number;
  names: string[];
}

export interface MotdStatus {
  host: string;
  port: number;
  /** 服务端返回状态失败时非空 */
  error?: string;
  version?: MotdVersion;
  players?: MotdPlayers;
  description?: MotdComponent;
  favicon?: string;
  /** 从发包到收到响应的往返耗时（毫秒） */
  latencyMs?: number;
}

/** 用 Server List Ping 协议读取服务器列表状态 */
export async function pingMinecraftServer(
  address: string,
  protocolVersion: number = DEFAULT_PROTOCOL_VERSION,
): Promise<MotdStatus> {
  const { host, port } = await resolveMinecraftEndpoint(address);
  try {
    const raw = await queryStatus(host, port, protocolVersion);
    const parsed = statusSchema.safeParse(raw);
    if (!parsed.success) {
      return { host, port, error: "服务端返回的状态格式无法识别" };
    }
    const data = parsed.data;
    const latencyMs = data.__latencyMs;
    return {
      host,
      port,
      latencyMs: typeof latencyMs === "number" ? latencyMs : undefined,
      version: data.version,
      players: data.players
        ? {
            online: data.players.online,
            max: data.players.max,
            names: (data.players.sample ?? [])
              .map((entry) => entry.name ?? "")
              .filter((name) => name.length > 0)
              .slice(0, 12),
          }
        : undefined,
      description: data.description,
      favicon: data.favicon,
    };
  } catch (err) {
    return { host, port, error: describeError(err) };
  }
}

function describeError(err: unknown): string {
  const code = (err as NodeJS.ErrnoException | undefined)?.code;
  if (code === "ETIMEDOUT" || code === "MOTD_TIMEOUT") return "连接超时，服务器未在规定时间内响应";
  if (code === "ENOTFOUND") return "域名解析失败，请检查服务器地址";
  if (code === "ECONNREFUSED") return "连接被拒绝，服务器可能未开启或端口错误";
  if (code === "ECONNRESET" || code === "EPIPE") return "连接被服务端重置，可能不是 Minecraft 服务器";
  const message = err instanceof Error ? err.message : String(err);
  return message || "查询失败";
}

function queryStatus(
  host: string,
  port: number,
  protocolVersion: number,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    socket.setTimeout(TIMEOUT_MS);
    socket.setNoDelay(true);

    let buffer = Buffer.alloc(0);
    let settled = false;
    let sentAt = 0;

    const finish = (err: Error | null, value?: Record<string, unknown>) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (err) reject(err);
      else resolve(value as Record<string, unknown>);
    };

    socket.on("connect", () => {
      sentAt = Date.now();
      try {
        socket.write(
          buildHandshakePacket(protocolVersion, host, port),
          () => socket.write(buildStatusRequestPacket()),
        );
      } catch (err) {
        finish(err instanceof Error ? err : new Error(String(err)));
      }
    });

    socket.on("timeout", () => finish(timeoutError(SENT_TIMEOUT)));

    socket.on("error", (err) => finish(err));

    socket.on("close", () => {
      if (!settled) {
        finish(timeoutError("连接在返回状态前被关闭，可能不是 Minecraft 服务器"));
      }
    });

    socket.on("data", (chunk) => {
      buffer = buffer.length === 0 ? chunk : Buffer.concat([buffer, chunk]);
      if (buffer.length > MAX_FRAME_BYTES) {
        finish(new Error(`状态响应过大：超过 ${MAX_FRAME_BYTES} 字节`));
        return;
      }
      try {
        const json = extractJson(buffer);
        if (!json) return;
        const status = JSON.parse(json) as Record<string, unknown>;
        status.__latencyMs = Date.now() - sentAt;
        finish(null, status);
      } catch (err) {
        finish(err instanceof Error ? err : new Error(String(err)));
      }
    });
  });
}

const SENT_TIMEOUT = "MOTD_TIMEOUT";

function timeoutError(code: string): NodeJS.ErrnoException {
  const err = new Error(code) as NodeJS.ErrnoException;
  err.code = code;
  return err;
}

/**
 * 从响应里截出完整的 JSON 对象。
 * 部分代理（BungeeCord 早期实现等）会在标准帧前多包一层长度头，
 * 因此不按固定偏移解析，改为从第一个 `{` 起做括号配平。
 */
function extractJson(buffer: Buffer): string | null {
  const start = buffer.indexOf(0x7b);
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < buffer.length; i += 1) {
    const byte = buffer[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (byte === 0x5c) escaped = true;
      else if (byte === 0x22) inString = false;
      continue;
    }
    if (byte === 0x22) inString = true;
    else if (byte === 0x7b) depth += 1;
    else if (byte === 0x7d) {
      depth -= 1;
      if (depth === 0) return buffer.subarray(start, i + 1).toString("utf8");
    }
  }
  return null;
}

function buildHandshakePacket(
  protocolVersion: number,
  host: string,
  port: number,
): Buffer {
  const hostBuf = Buffer.from(host, "utf8");
  const portBuf = Buffer.allocUnsafe(2);
  portBuf.writeUInt16BE(port);
  const body = Buffer.concat([
    writeVarInt(protocolVersion),
    writeVarInt(hostBuf.length),
    hostBuf,
    portBuf,
    writeVarInt(HANDSHAKE_STATE_STATUS),
  ]);
  return frame(0x00, body);
}

function buildStatusRequestPacket(): Buffer {
  return frame(0x00, Buffer.alloc(0));
}

function frame(packetId: number, body: Buffer): Buffer {
  const payload = Buffer.concat([writeVarInt(packetId), body]);
  return Buffer.concat([writeVarInt(payload.length), payload]);
}

function writeVarInt(value: number): Buffer {
  const out = Buffer.allocUnsafe(5);
  let n = value >>> 0;
  let i = 0;
  while (true) {
    if ((n & 0xffffff80) === 0) {
      out[i++] = n;
      break;
    }
    out[i++] = (n & 0x7f) | 0x80;
    n >>>= 7;
  }
  return out.subarray(0, i);
}
