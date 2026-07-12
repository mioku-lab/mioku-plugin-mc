import type { GameChatLine } from "../bot/play-bus";

export class PlayHistory {
  private gameLines: GameChatLine[] = [];
  private qqLines: string[] = [];

  constructor(
    private gameMax: number,
    private qqMax: number,
  ) {}

  pushGame(line: GameChatLine): void {
    this.gameLines.push(line);
    if (this.gameLines.length > this.gameMax) this.gameLines.shift();
  }

  pushQq(text: string): void {
    if (!text) return;
    this.qqLines.push(text);
    if (this.qqLines.length > this.qqMax) this.qqLines.shift();
  }

  getGameLines(): GameChatLine[] {
    return [...this.gameLines];
  }

  getQqLines(): string[] {
    return [...this.qqLines];
  }

  clear(): void {
    this.gameLines = [];
    this.qqLines = [];
  }
}
