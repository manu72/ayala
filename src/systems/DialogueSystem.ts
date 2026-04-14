import Phaser from 'phaser'

const FONT_FAMILY = 'Arial, Helvetica, sans-serif'

/**
 * Dialogue overlay rendered inside a given scene.
 * Shows lines of text one at a time, advancing on Space.
 */
export class DialogueSystem {
  private container: Phaser.GameObjects.Container
  private text: Phaser.GameObjects.Text
  private promptText: Phaser.GameObjects.Text
  private lines: string[] = []
  private currentLine = 0
  private active = false
  private onComplete: (() => void) | null = null
  private advanceKey: Phaser.Input.Keyboard.Key | null = null

  constructor(scene: Phaser.Scene) {
    const { width, height } = scene.cameras.main
    const boxW = width - 40
    const boxH = 90

    const background = scene.add
      .rectangle(0, 0, boxW, boxH, 0x000000, 0.8)
      .setOrigin(0.5)
      .setStrokeStyle(1, 0xffffff, 0.3)

    this.text = scene.add
      .text(0, -8, '', {
        fontFamily: FONT_FAMILY,
        fontSize: '16px',
        color: '#ffffff',
        wordWrap: { width: boxW - 40 },
        lineSpacing: 6,
      })
      .setOrigin(0.5, 0.5)

    this.promptText = scene.add
      .text(boxW / 2 - 14, boxH / 2 - 12, '[Space]', {
        fontFamily: FONT_FAMILY,
        fontSize: '11px',
        color: '#888888',
      })
      .setOrigin(1, 1)

    this.container = scene.add.container(width / 2, height - 65, [
      background, this.text, this.promptText,
    ])
    this.container.setDepth(100)
    this.container.setVisible(false)

    if (scene.input.keyboard) {
      this.advanceKey = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)
      this.advanceKey.on('down', () => this.advance())
    }
  }

  get isActive(): boolean {
    return this.active
  }

  show(lines: string[], onComplete?: () => void): void {
    if (this.active) return

    this.lines = lines
    this.currentLine = 0
    this.active = true
    this.onComplete = onComplete ?? null
    this.text.setText(this.lines[0] ?? '')
    this.container.setVisible(true)
  }

  private advance(): void {
    if (!this.active) return

    this.currentLine++
    if (this.currentLine >= this.lines.length) {
      this.container.setVisible(false)
      this.active = false
      if (this.onComplete) this.onComplete()
    } else {
      this.text.setText(this.lines[this.currentLine] ?? '')
    }
  }
}
