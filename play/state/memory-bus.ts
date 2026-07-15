export type MemoryKey =
  | "self"
  | "vitals"
  | "position"
  | "dimension"
  | "inventory"
  | "heldItem"
  | "armor"
  | "environment"
  | "equipment"
  | "nearestHostile"
  | "nearestPlayer"
  | "nearestCreeper"
  | "nearestPassiveMob"
  | "nearbyHostileNames"
  | "nearbyPlayerNames"
  | "combat"
  | "movement"
  | "mission";

export interface MemoryEntry<T = unknown> {
  value: T;
  updatedAt: number;
  ttlMs: number;
}

export interface MemoryChange<T = unknown> {
  key: MemoryKey;
  prev: T | undefined;
  next: T | undefined;
  at: number;
}

export class MemoryBus {
  private store = new Map<MemoryKey, MemoryEntry>();
  private watchers = new Map<MemoryKey, Set<(c: MemoryChange) => void>>();

  set<T>(key: MemoryKey, value: T, opts?: { ttlMs?: number }): void {
    const prev = this.store.get(key);
    const ttlMs = opts?.ttlMs ?? 0;
    const at = Date.now();
    this.store.set(key, { value, updatedAt: at, ttlMs });
    this.notify(key, prev?.value as T | undefined, value, at);
  }

  get<T = unknown>(key: MemoryKey): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.ttlMs > 0 && Date.now() - entry.updatedAt > entry.ttlMs) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  has(key: MemoryKey): boolean {
    return this.get(key) !== undefined;
  }

  watch<T = unknown>(key: MemoryKey, handler: (c: MemoryChange<T>) => void): () => void {
    let set = this.watchers.get(key);
    if (!set) {
      set = new Set();
      this.watchers.set(key, set);
    }
    const wrapped = handler as (c: MemoryChange) => void;
    set.add(wrapped);
    return () => {
      set!.delete(wrapped);
    };
  }

  update(mut: (bus: MemoryBus) => void): void {
    mut(this);
  }

  delete(key: MemoryKey): void {
    const prev = this.store.get(key);
    if (!prev) return;
    this.store.delete(key);
    this.notify(key, prev.value, undefined, Date.now());
  }

  clear(): void {
    const keys = [...this.store.keys()];
    const at = Date.now();
    for (const key of keys) {
      const prev = this.store.get(key);
      this.store.delete(key);
      this.notify(key, prev?.value, undefined, at);
    }
  }

  snapshot(): Record<string, { value: unknown; ageMs: number }> {
    const now = Date.now();
    const out: Record<string, { value: unknown; ageMs: number }> = {};
    for (const [key, entry] of this.store) {
      if (entry.ttlMs > 0 && now - entry.updatedAt > entry.ttlMs) continue;
      out[key] = { value: entry.value, ageMs: now - entry.updatedAt };
    }
    return out;
  }

  private notify(key: MemoryKey, prev: unknown, next: unknown, at: number): void {
    const set = this.watchers.get(key);
    if (!set) return;
    for (const handler of set) {
      try {
        handler({ key, prev, next, at });
      } catch {
        // 观察者错误不影响主流程
      }
    }
  }
}
