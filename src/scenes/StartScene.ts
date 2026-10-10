import Phaser from "phaser";
import { GAME_VERSION } from "../config/gameVersion";
import { SaveSystem } from "../systems/SaveSystem";
import { clearAllConversations } from "../services/ConversationStore";
import { ASSETS_READY, ASSET_PROGRESS } from "./BootScene";

/**
 * Start screen shown before the game begins.
 * Offers "Continue" (if a save exists), "New Game", and "New Game+"
 * (if the player has completed the story).
 *
 * Shown before the game's assets have loaded (BootScene loads them behind it):
 * a start chosen early waits for them, with progress below the buttons.
 */
export class StartScene extends Phaser.Scene {
  private pendingStart: (() => void) | null = null;
  /** A start has run; a second tap or key before the scene changes must not start another game. */
  private launched = false;
  private loadingBar: Phaser.GameObjects.Rectangle | null = null;
  private loadingText: Phaser.GameObjects.Text | null = null;

  constructor() {
    super({ key: "StartScene" });
  }

  create(): void {
    const { width, height } = this.cameras.main;
    // index.html's static stand-in for this screen covers the moment before the game code runs
    globalThis.document?.getElementById("splash")?.remove();
    this.pendingStart = null;
    this.launched = false;
    const start = (action: () => void) => {
      if (this.registry.get(ASSETS_READY) === "failed") globalThis.location?.reload();
      else if (this.assetsReady()) this.launch(action);
      else this.pendingStart = action;
    };

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
    const touch = this.sys.game.device.input.touch;

    // New Game erases the save on one touch and sits a thumb-width under Continue,
    // so on touch the first tap only arms it. Mouse and keyboard are unchanged.
    const confirmErase = (btn: Phaser.GameObjects.Text, label: string, pointer: Phaser.Input.Pointer): boolean => {
      if (!hasSave || !pointer.wasTouch || btn.text !== label) return true;
      btn.setText("Tap again to erase your save");
      this.time.delayedCall(3000, () => btn.setText(label));
      return false;
    };

    if (hasSave) {
      const continueBtn = this.add
        .text(width / 2, nextY, "Continue", {
          fontSize: "20px",
          color: "#44DD44",
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });

      if (touch) continueBtn.setPadding(24, 8);
      continueBtn.on("pointerover", () => continueBtn.setColor("#66FF66"));
      continueBtn.on("pointerout", () => continueBtn.setColor("#44DD44"));
      continueBtn.on("pointerdown", () => {
        start(() => this.scene.start("GameScene", { loadSave: true }));
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

    if (touch) newBtn.setPadding(24, 8);
    newBtn.on("pointerover", () => newBtn.setColor("#cccccc"));
    newBtn.on("pointerout", () => newBtn.setColor("#ffffff"));
    newBtn.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (confirmErase(newBtn, "New Game", pointer)) start(() => void this.startFreshGame());
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
      ngPlusBtn.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
        if (confirmErase(ngPlusBtn, "New Game+ (Cozy Mode)", pointer)) start(() => void this.startFreshGame({ newGamePlus: true }));
      });
      if (touch) ngPlusBtn.setPadding(24, 8);

      nextY += 30;
    }

    if (this.input.keyboard) {
      this.input.keyboard.on("keydown-ENTER", () => {
        if (hasSave) {
          start(() => this.scene.start("GameScene", { loadSave: true }));
        } else {
          start(() => void this.startFreshGame());
        }
      });

      this.input.keyboard.on("keydown-N", () => {
        start(() => void this.startFreshGame());
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

    if (!this.assetsReady()) {
      this.loadingBar = this.add.rectangle(width / 2 - 100, height * 0.78, 200, 3, 0xffffff, 0.5).setOrigin(0, 0.5).setScale(0, 1);
      this.loadingText = this.add.text(width / 2, height * 0.78 + 14, "", { fontSize: "12px", color: "#777777" }).setOrigin(0.5);
    }
  }

  update(): void {
    if (!this.loadingBar || !this.loadingText) return;
    if (this.registry.get(ASSETS_READY) === "failed") {
      this.pendingStart = null;
      this.loadingBar.setVisible(false);
      this.loadingText.setText("Couldn't load the game. Tap a button to try again.");
      return;
    }
    if (this.assetsReady()) {
      this.loadingBar.destroy();
      this.loadingText.destroy();
      this.loadingBar = this.loadingText = null;
      const action = this.pendingStart;
      this.pendingStart = null;
      if (action) this.launch(action);
      return;
    }
    const progress = Number(this.registry.get(ASSET_PROGRESS)) || 0;
    this.loadingBar.setScale(progress, 1);
    this.loadingText.setText(`${this.pendingStart ? "Starting" : "Loading"}… ${Math.round(progress * 100)}%`);
  }

  /** BootScene sets ASSETS_READY false while loading, "failed" on a failed download; unset counts as ready. */
  private assetsReady(): boolean {
    const status = this.registry.get(ASSETS_READY);
    return status === true || status === undefined;
  }

  private launch(action: () => void): void {
    if (this.launched) return;
    this.launched = true;
    action();
  }

  private async startFreshGame(options: { newGamePlus?: boolean } = {}): Promise<void> {
    SaveSystem.clear();
    await clearAllConversations();
    this.scene.start("GameScene", { loadSave: false, ...options });
  }
}
