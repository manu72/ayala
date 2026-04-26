import Phaser from "phaser";
import { GAME_VERSION } from "../config/gameVersion";
import { SaveSystem } from "../systems/SaveSystem";
import { clearAllConversations } from "../services/ConversationStore";

/**
 * Start screen shown before the game begins.
 * Offers "Continue" (if a save exists), "New Game", and "New Game+"
 * (if the player has completed the story).
 */
export class StartScene extends Phaser.Scene {
  constructor() {
    super({ key: "StartScene" });
  }

  create(): void {
    const { width, height } = this.cameras.main;

    this.cameras.main.setBackgroundColor("#111111");

    this.add
      .text(width / 2, height * 0.3, "AYALA", {
        fontSize: "40px",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height * 0.38, "A story about finding home", {
        fontSize: "14px",
        color: "#888888",
      })
      .setOrigin(0.5);

    let nextY = height * 0.55;
    const hasSave = SaveSystem.hasSave();
    const save = hasSave ? SaveSystem.load() : null;
    const isCompleted = save?.variables?.GAME_COMPLETED === true;

    if (hasSave) {
      const continueBtn = this.add
        .text(width / 2, nextY, "Continue", {
          fontSize: "20px",
          color: "#44DD44",
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });

      continueBtn.on("pointerover", () => continueBtn.setColor("#66FF66"));
      continueBtn.on("pointerout", () => continueBtn.setColor("#44DD44"));
      continueBtn.on("pointerdown", () => {
        this.scene.start("GameScene", { loadSave: true });
      });

      nextY += 40;
    }

    const newBtn = this.add
      .text(width / 2, nextY, "New Game", {
        fontSize: "20px",
        color: "#ffffff",
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    newBtn.on("pointerover", () => newBtn.setColor("#cccccc"));
    newBtn.on("pointerout", () => newBtn.setColor("#ffffff"));
    newBtn.on("pointerdown", () => {
      void this.startFreshGame();
    });

    nextY += 40;

    // New Game+ available after completing the story
    if (isCompleted) {
      const ngPlusBtn = this.add
        .text(width / 2, nextY, "New Game+ (Cozy Mode)", {
          fontSize: "18px",
          color: "#aaddff",
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });

      ngPlusBtn.on("pointerover", () => ngPlusBtn.setColor("#cceeFF"));
      ngPlusBtn.on("pointerout", () => ngPlusBtn.setColor("#aaddff"));
      ngPlusBtn.on("pointerdown", () => {
        void this.startFreshGame({ newGamePlus: true });
      });

      nextY += 30;
    }

    if (this.input.keyboard) {
      this.input.keyboard.on("keydown-ENTER", () => {
        if (hasSave) {
          this.scene.start("GameScene", { loadSave: true });
        } else {
          void this.startFreshGame();
        }
      });

      this.input.keyboard.on("keydown-N", () => {
        void this.startFreshGame();
      });
    }

    let hint = hasSave ? "Enter = Continue  |  N = New Game" : "Enter = Start";
    if (isCompleted) hint += "  |  New Game+ unlocked";
    this.add
      .text(width / 2, height * 0.85, hint, {
        fontSize: "10px",
        color: "#555555",
      })
      .setOrigin(0.5);

    this.add
      .text(width - 8, height - 8, `v${GAME_VERSION}`, {
        fontSize: "10px",
        color: "#555555",
      })
      .setOrigin(1, 1);
  }

  private async startFreshGame(options: { newGamePlus?: boolean } = {}): Promise<void> {
    SaveSystem.clear();
    await clearAllConversations();
    this.scene.start("GameScene", { loadSave: false, ...options });
  }
}
