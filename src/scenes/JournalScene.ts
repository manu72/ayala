import Phaser from "phaser";
import type { GameScene } from "./GameScene";

const FONT_FAMILY = "Arial, Helvetica, sans-serif";
const BG_COLOR = 0x111118;
const BG_ALPHA = 0.92;
const PANEL_PADDING = 24;
const LINE_HEIGHT = 16;
const HEART_FULL = "\u2665";
const HEART_EMPTY = "\u2661";

interface JournalEntry {
  name: string;
  description: string;
  metOnDay: number;
  trust: number;
  disposition: string;
}

/** Named cats and their default journal descriptions by trust level. */
const CAT_DESCRIPTIONS: Record<string, { low: string; high: string }> = {
  Blacky: { low: "Sits by the underpass. Wise.", high: "Blacky seems to trust you now." },
  Tiger: { low: "Central gardens. Territorial.", high: "Tiger is warming up to you." },
  Jayco: { low: "Lives near the shops. Friendly.", high: "Jayco considers you a friend." },
  "Jayco Jr": { low: "A tiny kitten near the shops.", high: "Jayco's kitten follows you around." },
  Fluffy: { low: "Central gardens. Aloof.", high: "Fluffy acknowledges your existence." },
  Pedigree: { low: "Near Nielson Tower. A former pet.", high: "Pedigree shares your story." },
  Ginger: { low: "A ginger cat near the fountain.", high: "The ginger cat tolerates you." },
  "Ginger B": { low: "The silent twin by the fountain.", high: "The twin watches without malice." },
};

export class JournalScene extends Phaser.Scene {
  private container!: Phaser.GameObjects.Container;
  private scrollY = 0;
  private contentHeight = 0;
  private visibleHeight = 0;

  constructor() {
    super({ key: "JournalScene" });
  }

  create(): void {
    const { width, height } = this.cameras.main;
    this.visibleHeight = height - PANEL_PADDING * 2;

    // Full-screen dimmed background
    const bg = this.add.rectangle(width / 2, height / 2, width, height, BG_COLOR, BG_ALPHA);
    bg.setInteractive();

    // Title
    this.add
      .text(PANEL_PADDING, PANEL_PADDING, "COLONY JOURNAL", {
        fontFamily: FONT_FAMILY,
        fontSize: "20px",
        fontStyle: "bold",
        color: "#ffffff",
      })
      .setDepth(10);

    // Close button
    const closeBtn = this.add
      .text(width - PANEL_PADDING, PANEL_PADDING, "[X]", {
        fontFamily: FONT_FAMILY,
        fontSize: "18px",
        color: "#aaaaaa",
      })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true })
      .setDepth(10);
    closeBtn.on("pointerover", () => closeBtn.setColor("#ffffff"));
    closeBtn.on("pointerout", () => closeBtn.setColor("#aaaaaa"));
    closeBtn.on("pointerdown", () => this.closeJournal());

    // Gather entries
    const entries = this.gatherEntries();
    const gameScene = this.scene.get("GameScene") as GameScene;
    const dayCount = gameScene?.dayNight?.dayCount ?? 1;

    // Scrollable content container
    this.container = this.add.container(PANEL_PADDING, PANEL_PADDING + 40);
    let yOffset = 0;

    for (const entry of entries) {
      // Name line with disposition indicator
      const dispSymbol = this.getDispositionSymbol(entry.disposition);
      const nameText = this.container.add(
        this.add.text(0, yOffset, `${dispSymbol} ${entry.name}`, {
          fontFamily: FONT_FAMILY,
          fontSize: "15px",
          fontStyle: "bold",
          color: "#eeddcc",
        }),
      );
      nameText.setData("__journal", true);
      yOffset += LINE_HEIGHT + 4;

      // Description
      this.container.add(
        this.add.text(12, yOffset, `"${entry.description}"`, {
          fontFamily: FONT_FAMILY,
          fontSize: "12px",
          fontStyle: "italic",
          color: "#aaaaaa",
          wordWrap: { width: width - PANEL_PADDING * 2 - 24 },
        }),
      );
      yOffset += LINE_HEIGHT + 2;

      // Met day
      this.container.add(
        this.add.text(12, yOffset, `Met: Day ${entry.metOnDay}`, {
          fontFamily: FONT_FAMILY,
          fontSize: "11px",
          color: "#888888",
        }),
      );
      yOffset += LINE_HEIGHT;

      // Trust hearts (each heart = 20 points, 5 hearts max)
      const hearts = this.buildHeartString(entry.trust);
      this.container.add(
        this.add.text(12, yOffset, `Trust: ${hearts}`, {
          fontFamily: FONT_FAMILY,
          fontSize: "12px",
          color: "#cc6688",
        }),
      );
      yOffset += LINE_HEIGHT + 12;
    }

    // Footer stats
    const colonyCount = 42;
    this.container.add(
      this.add.text(0, yOffset, `Colony count: ~${colonyCount} cats`, {
        fontFamily: FONT_FAMILY,
        fontSize: "12px",
        color: "#888888",
      }),
    );
    yOffset += LINE_HEIGHT;
    this.container.add(
      this.add.text(0, yOffset, `Days survived: ${dayCount}`, {
        fontFamily: FONT_FAMILY,
        fontSize: "12px",
        color: "#888888",
      }),
    );
    yOffset += LINE_HEIGHT;

    this.contentHeight = yOffset;
    this.scrollY = 0;

    // Scroll with mouse wheel
    this.input.on("wheel", (_pointer: unknown, _gos: unknown, _dx: number, dy: number) => {
      this.scrollY = Phaser.Math.Clamp(
        this.scrollY + dy * 0.5,
        0,
        Math.max(0, this.contentHeight - this.visibleHeight + 60),
      );
      this.container.setY(PANEL_PADDING + 40 - this.scrollY);
    });

    // ESC or J to close
    if (this.input.keyboard) {
      const escKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
      escKey.once("down", () => this.closeJournal());
      const jKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.J);
      jKey.once("down", () => this.closeJournal());
    }
  }

  private closeJournal(): void {
    this.scene.stop("JournalScene");
    const gameScene = this.scene.get("GameScene") as GameScene;
    gameScene?.resumeGame();
  }

  private gatherEntries(): JournalEntry[] {
    const gameScene = this.scene.get("GameScene") as GameScene;
    if (!gameScene) return [];

    const knownCats = (gameScene.registry.get("KNOWN_CATS") as string[]) ?? [];
    const dayCount = gameScene.dayNight?.dayCount ?? 1;
    const entries: JournalEntry[] = [];

    for (const name of knownCats) {
      if (name === "Colony Cat") continue;
      const trust = gameScene.trust.getCatTrust(name);
      const desc = CAT_DESCRIPTIONS[name];
      const description = desc
        ? trust >= 30
          ? desc.high
          : desc.low
        : "A cat from the colony.";

      entries.push({
        name,
        description,
        metOnDay: Math.max(1, dayCount - Math.floor(Math.random() * 2)),
        trust,
        disposition: this.getEffectiveDisposition(name, trust, gameScene),
      });
    }

    // Sort by trust descending
    entries.sort((a, b) => b.trust - a.trust);
    return entries;
  }

  private getEffectiveDisposition(name: string, trust: number, gameScene: GameScene): string {
    if (trust >= 50) return "friendly";
    // Check NPC's current disposition from scene
    const npcs = (gameScene as unknown as { npcs: Array<{ cat: { npcName: string; disposition: string } }> }).npcs;
    const entry = npcs?.find((e) => e.cat.npcName === name);
    return entry?.cat.disposition ?? "neutral";
  }

  private getDispositionSymbol(disposition: string): string {
    switch (disposition) {
      case "friendly":
        return HEART_FULL;
      case "territorial":
        return "!";
      case "wary":
        return "~";
      default:
        return "\u2014";
    }
  }

  private buildHeartString(trust: number): string {
    const full = Math.floor(trust / 20);
    const empty = 5 - full;
    return HEART_FULL.repeat(full) + HEART_EMPTY.repeat(empty);
  }
}
