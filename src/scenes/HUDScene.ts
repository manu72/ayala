import Phaser from "phaser";
import { GAME_VERSION } from "../config/gameVersion";
import type { GameScene } from "./GameScene";
import { DialogueSystem } from "../systems/DialogueSystem";
import { REST_HOLD_MS } from "../config/gameplayConstants";
import { AUDIO_MUTED_CHANGED } from "../systems/AudioSystem";

const PANEL_X = 8;
const PANEL_Y = 8;
const PANEL_W = 160;
const PANEL_PADDING = 10;

const BAR_W = 100;
const BAR_H = 10;
const BAR_GAP = 6;
const BAR_LABEL_W = 50;
const FONT_FAMILY = "Arial, Helvetica, sans-serif";

interface BarDef {
  stat: "hunger" | "thirst" | "energy";
  color: number;
  label: string;
}

const BARS: BarDef[] = [
  { stat: "hunger", color: 0xff8c00, label: "Hunger" },
  { stat: "thirst", color: 0x4488ff, label: "Thirst" },
  { stat: "energy", color: 0x88cc44, label: "Energy" },
];

export class HUDScene extends Phaser.Scene {
  dialogue!: DialogueSystem;

  private motionReduced(): boolean {
    return this.registry.get("MOTION_REDUCED") === true;
  }

  private fills: Phaser.GameObjects.Rectangle[] = [];
  private barLabels: Phaser.GameObjects.Text[] = [];
  private clockLabel!: Phaser.GameObjects.Text;
  private livesLabel!: Phaser.GameObjects.Text;
  private scoreLabel!: Phaser.GameObjects.Text;
  private warningOverlay!: Phaser.GameObjects.Rectangle;
  private exhaustedText!: Phaser.GameObjects.Text;
  private saveNotice!: Phaser.GameObjects.Text;

  private muteIcon!: Phaser.GameObjects.Image;
  private muteFocusRing!: Phaser.GameObjects.Rectangle;
  private muteListener: ((muted: boolean) => void) | null = null;

  private restProgressBg!: Phaser.GameObjects.Arc;
  private restProgressArc!: Phaser.GameObjects.Graphics;
  private restLabel!: Phaser.GameObjects.Text;

  private restingLabel!: Phaser.GameObjects.Text;

  private pauseContainer!: Phaser.GameObjects.Container;
  private pauseVersionLabel!: Phaser.GameObjects.Text;

  private narrationText!: Phaser.GameObjects.Text;
  private narrationTween: Phaser.Tweens.Tween | null = null;

  private chapterTitleCard!: Phaser.GameObjects.Text;
  private pauseChapterTitle!: Phaser.GameObjects.Text;
  private pauseChapterHint!: Phaser.GameObjects.Text;
  private edgePulseGraphics!: Phaser.GameObjects.Graphics;

  // Tracked TimerEvents from the reduced-motion code paths. They must be
  // cancelled before scheduling a replacement, otherwise a stale timer from a
  // previous call will fire during the current display and hide the card/pulse
  // prematurely. (tweens.killTweensOf() does not touch time.delayedCall.)
  private chapterTitleFadeTimer: Phaser.Time.TimerEvent | null = null;
  private edgePulseFadeTimer: Phaser.Time.TimerEvent | null = null;

  constructor() {
    super({ key: "HUDScene" });
  }

  create(): void {
    const { width, height } = this.cameras.main;

    // ──── Stats panel background ────
    const panelBg = this.add.graphics();
    const panelH = PANEL_PADDING + 20 + BARS.length * (BAR_H + BAR_GAP) + 34 + PANEL_PADDING - BAR_GAP;
    panelBg.fillStyle(0x000000, 0.45);
    panelBg.fillRoundedRect(PANEL_X, PANEL_Y, PANEL_W, panelH, 6);

    // ──── Clock ────
    this.clockLabel = this.add.text(PANEL_X + PANEL_PADDING, PANEL_Y + PANEL_PADDING, "", {
      fontFamily: FONT_FAMILY,
      fontSize: "14px",
      color: "#ffffff",
    });

    // ──── Stat bars ────
    const barsStartY = PANEL_Y + PANEL_PADDING + 22;

    BARS.forEach((def, i) => {
      const y = barsStartY + i * (BAR_H + BAR_GAP);
      const labelX = PANEL_X + PANEL_PADDING;

      const label = this.add
        .text(labelX, y, def.label, {
          fontFamily: FONT_FAMILY,
          fontSize: "11px",
          color: "#cccccc",
        })
        .setOrigin(0, 0);
      this.barLabels.push(label);

      const barX = labelX + BAR_LABEL_W;

      this.add.rectangle(barX, y + 1, BAR_W, BAR_H, 0x222222).setOrigin(0, 0);
      const fill = this.add.rectangle(barX, y + 1, BAR_W, BAR_H, def.color).setOrigin(0, 0);
      this.fills.push(fill);
    });

    const summaryY = barsStartY + BARS.length * (BAR_H + BAR_GAP) + 4;
    this.livesLabel = this.add.text(PANEL_X + PANEL_PADDING, summaryY, "", {
      fontFamily: FONT_FAMILY,
      fontSize: "12px",
      color: "#ff99aa",
    });
    this.scoreLabel = this.add.text(PANEL_X + PANEL_PADDING, summaryY + 16, "", {
      fontFamily: FONT_FAMILY,
      fontSize: "12px",
      color: "#f0e8d0",
    });

    // ──── Warning vignette ────
    this.warningOverlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0);

    // ──── Exhaustion message ────
    this.exhaustedText = this.add
      .text(width / 2, height / 2, "", {
        fontFamily: FONT_FAMILY,
        fontSize: "20px",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 4,
        align: "center",
        wordWrap: { width: width - 100 },
      })
      .setOrigin(0.5)
      .setVisible(false);

    // ──── Save notice ────
    // Shifted left to make room for the mute icon that lives in the top-right
    // corner. The notice auto-sizes its origin, so this is a pure reposition.
    this.saveNotice = this.add
      .text(width - 40, 14, "Saved", {
        fontFamily: FONT_FAMILY,
        fontSize: "14px",
        color: "#44DD44",
        stroke: "#000000",
        strokeThickness: 3,
      })
      .setOrigin(1, 0)
      .setAlpha(0);

    this.buildMuteToggle(width);

    // ──── Rest progress indicator ────
    this.restProgressBg = this.add.circle(width / 2, height / 2, 24, 0x000000, 0.5).setVisible(false);
    this.restProgressArc = this.add.graphics().setVisible(false);
    this.restLabel = this.add
      .text(width / 2, height / 2, "zzz", {
        fontFamily: FONT_FAMILY,
        fontSize: "13px",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setVisible(false);

    // ──── Resting label ────
    this.restingLabel = this.add
      .text(width / 2, height * 0.35, "Resting... move, Space or Z to wake", {
        fontFamily: FONT_FAMILY,
        fontSize: "16px",
        color: "#aaddff",
        stroke: "#000000",
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setVisible(false);

    // ──── Narration bar (top center, italic perception text) ────
    this.narrationText = this.add
      .text(width / 2, 40, "", {
        fontFamily: FONT_FAMILY,
        fontSize: "13px",
        fontStyle: "italic",
        color: "#ddeeff",
        stroke: "#000000",
        strokeThickness: 3,
        align: "center",
        wordWrap: { width: width - 60 },
      })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(90);

    // ──── Chapter title card ────
    this.chapterTitleCard = this.add
      .text(width / 2, height * 0.3, "", {
        fontFamily: FONT_FAMILY,
        fontSize: "22px",
        fontStyle: "italic",
        color: "#f0e8d0",
        stroke: "#000000",
        strokeThickness: 4,
        align: "center",
      })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(95);

    // ──── Screen edge pulse overlay ────
    this.edgePulseGraphics = this.add.graphics().setDepth(80).setAlpha(0);

    // ──── Dialogue ────
    this.dialogue = new DialogueSystem(this);

    // ──── Pause menu ────
    this.pauseContainer = this.createPauseMenu(width, height);
    this.pauseContainer.setVisible(false);
    this.pauseContainer.setDepth(200);
  }

  update(): void {
    const gameScene = this.scene.get("GameScene") as GameScene;
    if (!gameScene?.stats || !gameScene?.dayNight) return;

    const stats = gameScene.stats;
    const dayNight = gameScene.dayNight;

    this.clockLabel.setText(dayNight.clockText);
    const lives = Math.max(0, Math.min(3, gameScene.lives ?? 0));
    this.livesLabel.setText(`Lives ${"\u2665".repeat(lives)}${"\u2661".repeat(3 - lives)}`);
    this.scoreLabel.setText(`Score ${Math.floor(gameScene.scoring?.total ?? 0).toLocaleString()}`);

    BARS.forEach((def, i) => {
      const fill = this.fills[i];
      if (!fill) return;
      const value = stats[def.stat];
      fill.width = (value / 100) * BAR_W;

      if (value < 15) fill.setFillStyle(0xdd2222);
      else if (value < 30) fill.setFillStyle(0xddaa22);
      else fill.setFillStyle(def.color);
    });

    this.warningOverlay.setFillStyle(0x000000, stats.screenDarken ? 0.15 : 0);

    if (stats.collapsed) {
      this.exhaustedText.setText("Mamma Cat is exhausted.\nFind somewhere safe to rest.");
      this.exhaustedText.setVisible(true);
    } else {
      this.exhaustedText.setVisible(false);
    }

    this.updateRestProgress(gameScene);
    this.restingLabel.setVisible(gameScene.player?.isResting ?? false);
  }

  private updateRestProgress(gameScene: GameScene): void {
    const { width, height } = this.cameras.main;

    if (gameScene.restHoldActive && gameScene.restHoldTimer > 0) {
      const progress = Math.min(gameScene.restHoldTimer / REST_HOLD_MS, 1);
      this.restProgressBg.setVisible(true);
      this.restProgressArc.setVisible(true);
      this.restLabel.setVisible(true);

      this.restProgressArc.clear();
      this.restProgressArc.lineStyle(4, 0xaaddff, 0.9);
      this.restProgressArc.beginPath();
      const startAngle = -Math.PI / 2;
      const endAngle = startAngle + progress * Math.PI * 2;
      this.restProgressArc.arc(width / 2, height / 2, 20, startAngle, endAngle, false);
      this.restProgressArc.strokePath();
    } else {
      this.restProgressBg.setVisible(false);
      this.restProgressArc.setVisible(false);
      this.restLabel.setVisible(false);
    }
  }

  // ──────────── Pause Menu ────────────

  private createPauseMenu(width: number, height: number): Phaser.GameObjects.Container {
    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.6);

    const title = this.add
      .text(0, -110, "PAUSED", {
        fontFamily: FONT_FAMILY,
        fontSize: "28px",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    this.pauseChapterTitle = this.add
      .text(0, -76, "", {
        fontFamily: FONT_FAMILY,
        fontSize: "16px",
        fontStyle: "italic",
        color: "#f0e8d0",
      })
      .setOrigin(0.5);

    this.pauseChapterHint = this.add
      .text(0, -56, "", {
        fontFamily: FONT_FAMILY,
        fontSize: "12px",
        color: "#aaaaaa",
      })
      .setOrigin(0.5);

    const saveBtn = this.createMenuButton(0, -24, "Save Game", () => {
      const gameScene = this.scene.get("GameScene") as GameScene;
      gameScene.autoSave();
    });

    const journalBtn = this.createMenuButton(0, 16, "Colony Journal", () => {
      this.pauseContainer.setVisible(false);
      const gameScene = this.scene.get("GameScene") as GameScene;
      if (!this.scene.isActive("JournalScene")) {
        gameScene.isPaused = true;
        gameScene.journalOpenedFromPause = true;
        gameScene.physics.pause();
        this.scene.launch("JournalScene", { fromPauseMenu: true });
      }
    });

    const resumeBtn = this.createMenuButton(0, 56, "Resume", () => {
      const gameScene = this.scene.get("GameScene") as GameScene;
      gameScene.resumeGame();
      this.pauseContainer.setVisible(false);
    });

    const quitBtn = this.createMenuButton(0, 96, "Quit to Title", () => {
      const gameScene = this.scene.get("GameScene") as GameScene;
      this.pauseContainer.setVisible(false);
      gameScene.quitToTitle();
    });

    this.pauseVersionLabel = this.add
      .text(width / 2 - 8, height / 2 - 8, `v${GAME_VERSION}`, {
        fontFamily: FONT_FAMILY,
        fontSize: "10px",
        color: "#666666",
      })
      .setOrigin(1, 1);

    return this.add.container(width / 2, height / 2, [
      overlay, title, this.pauseChapterTitle, this.pauseChapterHint,
      saveBtn, journalBtn, resumeBtn, quitBtn, this.pauseVersionLabel,
    ]);
  }

  /**
   * Top-right mute toggle. Driven by the AudioSystem's mute flag (which
   * persists across scene restarts via localStorage), so the icon state is
   * the source-of-truth reflection of that flag — never the other way around.
   *
   * The hit area is slightly larger than the visible 20px glyph so the icon
   * is comfortable to click on touch displays. A simple focus ring fades in
   * on hover to satisfy the "visible focus state" accessibility rule for a
   * Phaser-canvas control that can't inherit browser focus styles. The glyph
   * itself carries the semantic state (speaker-with-waves vs speaker-with-X)
   * independently of colour, per the "don't rely on colour alone" rule.
   */
  private buildMuteToggle(width: number): void {
    const ICON_SIZE = 20;
    const PAD = 10;
    const cx = width - PAD - ICON_SIZE / 2;
    const cy = PAD + ICON_SIZE / 2;

    this.muteFocusRing = this.add
      .rectangle(cx, cy, ICON_SIZE + 10, ICON_SIZE + 10, 0x000000, 0.35)
      .setStrokeStyle(1, 0xffffff, 0.75)
      .setAlpha(0)
      .setDepth(94);

    this.muteIcon = this.add
      .image(cx, cy, "icon_volume_on")
      .setDisplaySize(ICON_SIZE, ICON_SIZE)
      .setDepth(95);

    const hit = this.add
      .rectangle(cx, cy, ICON_SIZE + 10, ICON_SIZE + 10, 0x000000, 0)
      .setInteractive({ useHandCursor: true })
      .setDepth(96);

    const gameScene = this.scene.get("GameScene") as GameScene;

    const refresh = (muted: boolean) => {
      this.muteIcon.setTexture(muted ? "icon_volume_off" : "icon_volume_on");
      this.muteIcon.setAlpha(muted ? 0.6 : 1);
    };

    const toggle = () => {
      if (!gameScene?.audio) return;
      gameScene.audio.toggleMuted();
    };

    hit.on("pointerover", () => this.muteFocusRing.setAlpha(1));
    hit.on("pointerout", () => this.muteFocusRing.setAlpha(0));
    hit.on("pointerdown", toggle);

    // M-key shortcut; verified no other binding claims M. Must not fire while
    // typing into an input (we don't have any, but guard anyway) and is
    // deliberately not scene-paused so it works even from the pause menu.
    const mKey = this.input.keyboard?.addKey("M", true, false);
    mKey?.on("down", toggle);

    // React to mute changes from any source (click, hotkey, or future code
    // paths) via the GameScene event bus. Listener is unsubscribed on HUD
    // shutdown so scene restarts don't leak closures.
    this.muteListener = refresh;
    gameScene?.events.on(AUDIO_MUTED_CHANGED, refresh);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.muteListener) {
        gameScene?.events.off(AUDIO_MUTED_CHANGED, this.muteListener);
        this.muteListener = null;
      }
      mKey?.off("down", toggle);
    });

    // Reflect the persisted state on first mount.
    if (gameScene?.audio) refresh(gameScene.audio.isMuted());
  }

  private createMenuButton(x: number, y: number, label: string, callback: () => void): Phaser.GameObjects.Text {
    const btn = this.add
      .text(x, y, label, {
        fontFamily: FONT_FAMILY,
        fontSize: "18px",
        color: "#cccccc",
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    btn.on("pointerover", () => btn.setColor("#ffffff"));
    btn.on("pointerout", () => btn.setColor("#cccccc"));
    btn.on("pointerdown", callback);
    return btn;
  }

  showPauseMenu(): void {
    const gameScene = this.scene.get("GameScene") as GameScene;
    if (gameScene?.chapters) {
      this.pauseChapterTitle.setText(gameScene.chapters.titleCard);
      this.pauseChapterHint.setText(gameScene.chapters.hint);
    }
    this.pauseContainer.setVisible(true);
  }

  hidePauseMenu(): void {
    this.pauseContainer.setVisible(false);
  }

  /** Display a chapter title card that fades in, holds, then fades out. */
  showChapterTitle(text: string): void {
    this.chapterTitleCard.setText(text);
    this.tweens.killTweensOf(this.chapterTitleCard);
    // Cancel any pending reduced-motion fade-out from a prior call; otherwise
    // it could fire mid-display and hide the new card early. We do this
    // regardless of the current branch so that a mode toggle between calls
    // cannot leave a stale timer behind.
    if (this.chapterTitleFadeTimer) {
      this.chapterTitleFadeTimer.remove(false);
      this.chapterTitleFadeTimer = null;
    }
    this.chapterTitleCard.setAlpha(0);

    if (this.motionReduced()) {
      this.chapterTitleCard.setAlpha(1);
      this.chapterTitleFadeTimer = this.time.delayedCall(3000, () => {
        this.chapterTitleCard.setAlpha(0);
        this.chapterTitleFadeTimer = null;
      });
      return;
    }

    this.tweens.add({
      targets: this.chapterTitleCard,
      alpha: 1,
      duration: 1200,
      ease: "Sine.easeIn",
      hold: 3000,
      yoyo: true,
      onComplete: () => this.chapterTitleCard.setAlpha(0),
    });
  }

  /** Pulse a subtle colour at the screen edges for story cues. */
  pulseEdge(color: number, intensity = 0.25, durationMs = 2000): void {
    const { width, height } = this.cameras.main;
    this.edgePulseGraphics.clear();

    const thickness = 48;
    this.edgePulseGraphics.fillStyle(color, 1);
    this.edgePulseGraphics.fillRect(0, 0, width, thickness);
    this.edgePulseGraphics.fillRect(0, height - thickness, width, thickness);
    this.edgePulseGraphics.fillRect(0, 0, thickness, height);
    this.edgePulseGraphics.fillRect(width - thickness, 0, thickness, height);

    this.tweens.killTweensOf(this.edgePulseGraphics);
    // Same stale-timer guard as showChapterTitle: pulseEdge has three call
    // sites (story beats) that can overlap within the 2–3s pulse window.
    if (this.edgePulseFadeTimer) {
      this.edgePulseFadeTimer.remove(false);
      this.edgePulseFadeTimer = null;
    }
    this.edgePulseGraphics.setAlpha(0);

    if (this.motionReduced()) {
      this.edgePulseGraphics.setAlpha(intensity);
      this.edgePulseFadeTimer = this.time.delayedCall(durationMs, () => {
        this.edgePulseGraphics.setAlpha(0);
        this.edgePulseFadeTimer = null;
      });
      return;
    }

    this.tweens.add({
      targets: this.edgePulseGraphics,
      alpha: intensity,
      duration: durationMs / 4,
      yoyo: true,
      repeat: 1,
      ease: "Sine.easeInOut",
      onComplete: () => this.edgePulseGraphics.setAlpha(0),
    });
  }

  /** Show a brief narration line at the top of the screen (Mamma Cat's inner voice). */
  showNarration(line: string): void {
    if (this.narrationTween) {
      this.narrationTween.destroy();
      this.narrationTween = null;
    }
    this.narrationText.setText(line);
    this.narrationText.setAlpha(1);
    this.narrationTween = this.tweens.add({
      targets: this.narrationText,
      alpha: 0,
      delay: 3000,
      duration: 1000,
      ease: "Linear",
      onComplete: () => {
        this.narrationTween = null;
      },
    });
  }

  showSaveNotice(): void {
    this.saveNotice.setAlpha(1);
    this.tweens.add({
      targets: this.saveNotice,
      alpha: 0,
      delay: 800,
      duration: 600,
      ease: "Linear",
    });
  }
}
