/**
 * Epilogue and end screen shown after Chapter 6 (adoption).
 *
 * Displays a quiet sequence of narration about the real cat crisis,
 * followed by a call to action and credits. The tone is invitational,
 * not preachy — the player has just lived the experience.
 */

import Phaser from "phaser";

const FONT_FAMILY = "Arial, Helvetica, sans-serif";

const EPILOGUE_LINES = [
  "Mamma Cat found her home.",
  "",
  "But 40 million stray cats in Southeast Asia are still waiting.",
  "In the Philippines alone, millions of cats live on the streets.",
  "Organizations like CARA Welfare Philippines cared for the ATG cats for 15 years.",
  "Community volunteers continue that work today.",
];

const CTA_LINES = [
  "What can you do?",
  "",
  "Adopt, don't shop.",
  "Support local TNR (Trap-Neuter-Return) programs.",
  "Feed a stray. Leave water out.",
  "Or just stop. And see them.",
];

const LINKS = [
  { label: "CARA Welfare Philippines", url: "https://www.caraphil.org" },
  { label: "@atgcats on Instagram", url: "https://www.instagram.com/atgcats" },
];

const CREDITS = [
  "AYALA",
  "",
  "Developer: Manu",
  "AI Co-developer: Claude",
  "",
  "For Camille",
  "",
  "Based on the real cat colony at",
  "Ayala Triangle Gardens, Makati, Manila",
  "",
  "For Mamma Cat, and all the cats still waiting.",
];

export class EpilogueScene extends Phaser.Scene {
  private container!: Phaser.GameObjects.Container;

  constructor() {
    super({ key: "EpilogueScene" });
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#000000");
    this.container = this.add.container(0, 0);
    this.time.delayedCall(1500, () => this.showPhase(0));
  }

  private showPhase(phase: number): void {
    const { width, height } = this.cameras.main;

    // Clear previous content
    this.container.removeAll(true);

    switch (phase) {
      case 0:
        this.showTextSequence(EPILOGUE_LINES, width, height, () => {
          this.time.delayedCall(2000, () => this.showPhase(1));
        });
        break;

      case 1:
        this.showTextSequence(CTA_LINES, width, height, () => {
          this.time.delayedCall(2000, () => this.showPhase(2));
        });
        break;

      case 2:
        this.showLinks(width, height);
        this.time.delayedCall(6000, () => this.showPhase(3));
        break;

      case 3:
        this.showCredits(width, height);
        break;
    }
  }

  private showTextSequence(
    lines: string[],
    width: number,
    height: number,
    onComplete: () => void,
  ): void {
    let yOffset = height * 0.3;
    let delay = 0;

    for (const line of lines) {
      if (line === "") {
        yOffset += 20;
        delay += 500;
        continue;
      }

      const text = this.add
        .text(width / 2, yOffset, line, {
          fontFamily: FONT_FAMILY,
          fontSize: "16px",
          fontStyle: "italic",
          color: "#cccccc",
          align: "center",
          wordWrap: { width: width - 80 },
        })
        .setOrigin(0.5)
        .setAlpha(0);

      this.container.add(text);

      this.tweens.add({
        targets: text,
        alpha: 1,
        duration: 1200,
        delay,
        ease: "Linear",
      });

      yOffset += 28;
      delay += 1500;
    }

    this.time.delayedCall(delay + 2000, onComplete);
  }

  private showLinks(width: number, height: number): void {
    let yOffset = height * 0.35;

    const heading = this.add
      .text(width / 2, yOffset, "Learn more:", {
        fontFamily: FONT_FAMILY,
        fontSize: "14px",
        color: "#888888",
      })
      .setOrigin(0.5);
    this.container.add(heading);
    yOffset += 30;

    for (const link of LINKS) {
      const linkText = this.add
        .text(width / 2, yOffset, link.label, {
          fontFamily: FONT_FAMILY,
          fontSize: "15px",
          color: "#4488cc",
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });

      linkText.on("pointerover", () => linkText.setColor("#66bbff"));
      linkText.on("pointerout", () => linkText.setColor("#4488cc"));
      linkText.on("pointerdown", () => {
        window.open(link.url, "_blank");
      });

      this.container.add(linkText);
      yOffset += 28;
    }
  }

  private showCredits(width: number, height: number): void {
    let yOffset = height * 0.2;

    for (const line of CREDITS) {
      if (line === "") {
        yOffset += 16;
        continue;
      }

      const isTitle = line === "AYALA";
      const text = this.add
        .text(width / 2, yOffset, line, {
          fontFamily: FONT_FAMILY,
          fontSize: isTitle ? "28px" : "14px",
          fontStyle: isTitle ? "bold" : "normal",
          color: isTitle ? "#ffffff" : "#aaaaaa",
          align: "center",
        })
        .setOrigin(0.5);

      this.container.add(text);
      yOffset += isTitle ? 40 : 22;
    }

    // Return to title button
    yOffset += 30;
    const returnBtn = this.add
      .text(width / 2, yOffset, "Return to Title", {
        fontFamily: FONT_FAMILY,
        fontSize: "18px",
        color: "#44DD44",
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    returnBtn.on("pointerover", () => returnBtn.setColor("#66FF66"));
    returnBtn.on("pointerout", () => returnBtn.setColor("#44DD44"));
    returnBtn.on("pointerdown", () => {
      this.scene.start("StartScene");
    });

    this.container.add(returnBtn);
  }
}
