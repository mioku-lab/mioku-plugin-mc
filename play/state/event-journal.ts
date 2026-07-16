import type { PlayEventType } from "../types";

export type { PlayEventType };

export interface PlayEvent<T = unknown> {
  seq: number;
  at: number;
  type: PlayEventType;
  data: T;
}

export interface EventBatch {
  events: PlayEvent[];
  cursor: number;
}

export class PlayEventJournal {
  private seq = 0;
  private events: PlayEvent[] = [];
  private listeners = new Set<(event: PlayEvent) => void>();

  constructor(private readonly maxEntries = 300) {}

  append<T>(type: PlayEventType, data: T): PlayEvent<T> {
    const event: PlayEvent<T> = {
      seq: ++this.seq,
      at: Date.now(),
      type,
      data,
    };
    this.events.push(event);
    if (this.events.length > this.maxEntries) {
      this.events.splice(0, this.events.length - this.maxEntries);
    }
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Journal consumers must not affect the game loop.
      }
    }
    return event;
  }

  readAfter(
    cursor: number,
    filter?: (event: PlayEvent) => boolean,
    limit?: number,
  ): EventBatch {
    const matched = this.events.filter(
      (event) => event.seq > cursor && (!filter || filter(event)),
    );
    return {
      events: limit && matched.length > limit ? matched.slice(-limit) : matched,
      cursor: matched.at(-1)?.seq ?? cursor,
    };
  }

  subscribe(listener: (event: PlayEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  latestCursor(): number {
    return this.seq;
  }

  clear(): void {
    this.events = [];
    this.listeners.clear();
  }
}