import Phaser from "phaser";
import type { ScoreBreakdown } from "../systems/ScoringSystem";
import { clearAllConversations } from "../services/ConversationStore";

const FONT_FAMILY = "Arial, Helvetica, sans-serif";

export interface GameOverSceneData {
  reason: "collapse" | "snatched";
  score: number;
  breakdown: ScoreBreakdown;
}

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super({ key: "GameOverScene" });
  }

  create(data: GameOverSceneData): void {
    const { width, height } = this.cameras.main;
    const title = data.reason === "snatched" ? "Hands. Darkness." : "You can't go any further.";

    this.add.rectangle(width / 2, height / 2, width, height, 0x07070c, 0.96);
    this.add
      .text(width / 2, 72, "RUN COMPLETE", {
        fontFamily: FONT_FAMILY,
        fontSize: "22px",
        fontStyle: "bold",
        color: "#ffffff",
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, 112, title, {
        fontFamily: FONT_FAMILY,
        fontSize: "15px",
        color: "#cccccc",
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, 158, `Final score: ${Math.floor(data.score).toLocaleString()}`, {
        fontFamily: FONT_FAMILY,
        fontSize: "20px",
        fontStyle: "bold",
        color: "#f0e8d0",
      })
      .setOrigin(0.5);

    const rows = Object.values(data.breakdown);
    const startY = 205;
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i]!;
      const value =
        row.label === "Territory explored" && "percent" in row
          ? `${Math.round(row.percent)}%`
          : Math.floor(row.value).toLocaleString();
      this.add.text(170, startY + i * 20, `${row.label}: ${value} (+${row.points})`, {
        fontFamily: FONT_FAMILY,
        fontSize: "12px",
        color: "#aaaaaa",
      });
    }

    const button = this.add
      .text(width / 2, height - 82, "[ New Game ]", {
        fontFamily: FONT_FAMILY,
        fontSize: "18px",
        color: "#ffffff",
        backgroundColor: "#333333",
        padding: { x: 14, y: 8 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    button.on("pointerdown", () => {
      void this.startNewGame();
    });

    this.input.keyboard?.once("keydown-SPACE", () => {
      void this.startNewGame();
    });
    this.input.keyboard?.once("keydown-ENTER", () => {
      void this.startNewGame();
    });
  }

  private async startNewGame(): Promise<void> {
    await clearAllConversations();
    this.scene.stop("HUDScene");
    this.scene.stop("JournalScene");
    this.scene.stop("GameScene");
    this.scene.start("GameScene");
  }
}
