import Phaser from "phaser";

const FONT_FAMILY = "Arial, Helvetica, sans-serif";

/**
 * Optional per-call lifecycle hooks for {@link DialogueSystem.show}.
 *
 * Used by callers that need to keep a parallel surface (e.g. a floating
 * human-spoken bubble above an NPC's head) in lockstep with the modal
 * dialogue's narrator lines.
 *
 * Semantics:
 *  - `onLineShown(index)` fires once each time a new line becomes visible,
 *    including the very first line at `show()` time. It fires BEFORE the
 *    player can advance, and before `onComplete`.
 *  - `onHide()` fires on every hide path (completion, Space-past-end, or
 *    `dismiss()`), after internal state is cleared. Use it to tear down
 *    any caller-owned bubbles or side-channels, regardless of whether
 *    the beat completed cleanly.
 */
export interface DialogueHooks {
  onLineShown?: (index: number) => void;
  onHide?: () => void;
}

/**
 * Dialogue overlay rendered inside a given scene.
 * Shows lines of text one at a time, advancing on Space.
 *
 * Non-blocking: the player can move while dialogue is visible.
 * Dismissible: click outside the box or the X button to close early.
 * Early dismissal does NOT fire onComplete (story-critical callbacks
 * only run when the player reads through all lines), but it DOES
 * fire `hooks.onHide()` so callers can always tear down paired
 * surfaces such as spoken bubbles.
 */
export class DialogueSystem {
  private container: Phaser.GameObjects.Container;
  private backdrop: Phaser.GameObjects.Rectangle;
  private background: Phaser.GameObjects.Rectangle;
  private text: Phaser.GameObjects.Text;
  private promptText: Phaser.GameObjects.Text;
  private closeBtn: Phaser.GameObjects.Text;
  private lines: string[] = [];
  private currentLine = 0;
  private active = false;
  private onComplete: (() => void) | null = null;
  private hooks: DialogueHooks | null = null;
  private advanceKey: Phaser.Input.Keyboard.Key | null = null;

  constructor(scene: Phaser.Scene) {
    const { width, height } = scene.cameras.main;
    const boxW = width - 40;
    const boxH = 90;

    // Full-screen invisible backdrop catches clicks outside the dialogue box
    this.backdrop = scene.add
      .rectangle(width / 2, height / 2, width, height, 0x000000, 0)
      .setInteractive()
      .setDepth(99)
      .setVisible(false);
    this.backdrop.on("pointerdown", () => this.dismiss());
    if (this.backdrop.input) this.backdrop.input.enabled = false;

    this.background = scene.add
      .rectangle(0, 0, boxW, boxH, 0x000000, 0.8)
      .setOrigin(0.5)
      .setStrokeStyle(1, 0xffffff, 0.3)
      .setInteractive();

    this.text = scene.add
      .text(0, -8, "", {
        fontFamily: FONT_FAMILY,
        fontSize: "16px",
        color: "#ffffff",
        wordWrap: { width: boxW - 40 },
        lineSpacing: 6,
      })
      .setOrigin(0.5, 0.5);

    this.promptText = scene.add
      .text(boxW / 2 - 14, boxH / 2 - 12, "[Space]", {
        fontFamily: FONT_FAMILY,
        fontSize: "11px",
        color: "#888888",
      })
      .setOrigin(1, 1);

    this.closeBtn = scene.add
      .text(boxW / 2 - 12, -boxH / 2 + 12, "x", {
        fontFamily: FONT_FAMILY,
        fontSize: "14px",
        color: "#666666",
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    this.closeBtn.on("pointerover", () => this.closeBtn.setColor("#ffffff"));
    this.closeBtn.on("pointerout", () => this.closeBtn.setColor("#666666"));
    this.closeBtn.on("pointerdown", () => this.dismiss());

    this.container = scene.add.container(width / 2, height - 65, [
      this.background,
      this.text,
      this.promptText,
      this.closeBtn,
    ]);
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

  show(lines: string[], onComplete?: () => void, hooks?: DialogueHooks): void {
    if (this.active) return;

    this.lines = lines;
    this.currentLine = 0;
    this.active = true;
    this.onComplete = onComplete ?? null;
    this.hooks = hooks ?? null;
    this.text.setText(this.lines[0] ?? "");
    this.container.setVisible(true);
    this.backdrop.setVisible(true);
    if (this.backdrop.input) this.backdrop.input.enabled = true;

    // Fire the first-line hook after the modal is fully configured so the
    // caller can safely spawn a paired bubble in response to index 0.
    this.hooks?.onLineShown?.(0);
  }

  /**
   * Close dialogue early without firing onComplete.
   *
   * Still fires `hooks.onHide()` so callers can tear down paired surfaces
   * (e.g. a persistent spoken bubble above an NPC).
   */
  dismiss(): void {
    if (!this.active) return;
    this.hide();
  }

  private advance(): void {
    if (!this.active) return;

    this.currentLine++;
    if (this.currentLine >= this.lines.length) {
      const doneHook = this.onComplete;
      this.hide();
      if (doneHook) doneHook();
    } else {
      this.text.setText(this.lines[this.currentLine] ?? "");
      this.hooks?.onLineShown?.(this.currentLine);
    }
  }

  private hide(): void {
    this.container.setVisible(false);
    this.backdrop.setVisible(false);
    if (this.backdrop.input) this.backdrop.input.enabled = false;
    this.active = false;
    // Snapshot-and-clear so `onHide` callbacks that reshow dialogue can
    // install new hooks without being overwritten by us.
    const hideHook = this.hooks?.onHide;
    this.hooks = null;
    if (hideHook) hideHook();
  }
}
