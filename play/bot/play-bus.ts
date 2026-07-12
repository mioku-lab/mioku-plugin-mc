import { EventEmitter } from "events";

export interface GameChatLine {
  kind: "chat" | "whisper" | "join" | "left" | "death" | "system";
  username?: string;
  text: string;
  at: number;
}

export interface PlayBusEvents {
  spawn: () => void;
  chat: (line: GameChatLine) => void;
  health: () => void;
  death: () => void;
  respawn: () => void;
  kicked: (reason: string) => void;
  end: (reason: string) => void;
  error: (err: Error) => void;
  playerJoined: (username: string) => void;
  playerLeft: (username: string) => void;
  entityHurt: (entity: any) => void;
  physicTick: () => void;
}

export type PlayBusEvent = keyof PlayBusEvents;

export class PlayBus {
  private emitter = new EventEmitter();

  emit<K extends PlayBusEvent>(event: K, ...args: any[]): void {
    this.emitter.emit(event, ...args);
  }

  on<K extends PlayBusEvent>(event: K, listener: PlayBusEvents[K]): this {
    this.emitter.on(event, listener as (...args: any[]) => void);
    return this;
  }

  off<K extends PlayBusEvent>(event: K, listener: PlayBusEvents[K]): this {
    this.emitter.off(event, listener as (...args: any[]) => void);
    return this;
  }

  removeAll(): void {
    this.emitter.removeAllListeners();
  }
}
