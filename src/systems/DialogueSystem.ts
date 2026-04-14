import Phaser from "phaser";

/**
 * Simple dialogue overlay anchored to the bottom of the camera viewport.
 * Shows lines of text one at a time, advancing on Space/Enter.
 */
export class DialogueSystem {
  private container: Phaser.GameObjects.Container;
  private text: Phaser.GameObjects.Text;
  private promptText: Phaser.GameObjects.Text;
  private lines: string[] = [];
  private currentLine = 0;
  private active = false;
  private onComplete: (() => void) | null = null;
  private advanceKey: Phaser.Input.Keyboard.Key | null = null;

  constructor(scene: Phaser.Scene) {
    const cam = scene.cameras.main;
    const boxW = cam.width - 40;
    const boxH = 80;

    const background = scene.add
      .rectangle(0, 0, boxW, boxH, 0x000000, 0.75)
      .setOrigin(0.5)
      .setStrokeStyle(2, 0xffffff, 0.5);

    this.text = scene.add
      .text(0, -10, "", {
        fontSize: "14px",
        color: "#ffffff",
        wordWrap: { width: boxW - 30 },
        lineSpacing: 4,
      })
      .setOrigin(0.5, 0.5);

    this.promptText = scene.add
      .text(boxW / 2 - 20, boxH / 2 - 16, "[Space]", {
        fontSize: "10px",
        color: "#aaaaaa",
      })
      .setOrigin(1, 1);

    this.container = scene.add.container(cam.width / 2, cam.height - 60, [background, this.text, this.promptText]);
    this.container.setScrollFactor(0);
    this.container.setDepth(100);
    this.container.setVisible(false);

    if (scene.input.keyboard) {
      this.advanceKey = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
      this.advanceKey.on("down", () => this.advance());
    }
  }

  get isActive(): boolean {
    return this.active;
  }

  show(lines: string[], onComplete?: () => void): void {
    if (this.active) return;

    this.lines = lines;
    this.currentLine = 0;
    this.active = true;
    this.onComplete = onComplete ?? null;
    this.text.setText(this.lines[0] ?? "");
    this.container.setVisible(true);
  }

  private advance(): void {
    if (!this.active) return;

    this.currentLine++;
    if (this.currentLine >= this.lines.length) {
      this.container.setVisible(false);
      this.active = false;
      if (this.onComplete) this.onComplete();
    } else {
      this.text.setText(this.lines[this.currentLine] ?? "");
    }
  }
}
