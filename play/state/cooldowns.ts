export class CooldownRegistry {
  private until = new Map<string, number>();

  set(key: string, durationMs: number, now = Date.now()): void {
    this.until.set(key, now + durationMs);
  }

  setUntil(key: string, untilMs: number): void {
    this.until.set(key, untilMs);
  }

  clear(key: string): void {
    this.until.delete(key);
  }

  clearAll(): void {
    this.until.clear();
  }

  /** 剩余毫秒，0 表示已就绪。 */
  remaining(key: string, now = Date.now()): number {
    const until = this.until.get(key);
    if (until === undefined) return 0;
    return until > now ? until - now : 0;
  }

  isReady(key: string, now = Date.now()): boolean {
    return this.remaining(key, now) === 0;
  }

  /** 调试快照：key -> 剩余毫秒（已就绪的不输出）。 */
  snapshot(now = Date.now()): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [key, until] of this.until) {
      const left = until - now;
      if (left > 0) out[key] = left;
    }
    return out;
  }
}
