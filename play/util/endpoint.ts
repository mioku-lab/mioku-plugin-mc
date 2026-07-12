import { promises as dns } from "dns";

const DEFAULT_PORT = 25565;

function parseHostPort(input: string): { host: string; port?: number } {
  const host = input.trim();
  const lastColon = host.lastIndexOf(":");
  if (lastColon > 0 && lastColon < host.length - 1) {
    const suffix = host.slice(lastColon + 1);
    const n = Number(suffix);
    if (Number.isInteger(n) && n > 0 && n <= 65535) {
      return { host: host.slice(0, lastColon), port: n };
    }
  }
  return { host };
}

export async function resolveMinecraftEndpoint(
  input: string,
  defaultPort: number = DEFAULT_PORT,
): Promise<{ host: string; port: number }> {
  const { host: rawHost, port: explicitPort } = parseHostPort(input);
  if (explicitPort !== undefined) {
    return { host: rawHost, port: explicitPort };
  }
  const srvName = rawHost.startsWith("_minecraft._tcp.")
    ? rawHost
    : `_minecraft._tcp.${rawHost}`;
  try {
    const records = await dns.resolveSrv(srvName);
    if (records && records.length > 0) {
      return { host: records[0].name, port: records[0].port };
    }
  } catch {
    // no SRV record; fall back to direct connection
  }
  return { host: rawHost, port: defaultPort };
}