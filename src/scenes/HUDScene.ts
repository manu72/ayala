import Phaser from 'phaser'
import type { GameScene } from './GameScene'

const BAR_W = 60
const BAR_H = 6
const BAR_GAP = 3
const BAR_X = 10
const BAR_Y = 22

interface BarDef {
  stat: 'hunger' | 'thirst' | 'energy'
  color: number
  label: string
}

const BARS: BarDef[] = [
  { stat: 'hunger', color: 0xff8c00, label: 'H' },
  { stat: 'thirst', color: 0x4488ff, label: 'T' },
  { stat: 'energy', color: 0x88cc44, label: 'E' },
]

/**
 * Overlay scene that renders the HUD at 1x zoom above the game.
 * Launched as a parallel scene from GameScene so it's never
 * affected by the game camera's zoom or scroll.
 */
export class HUDScene extends Phaser.Scene {
  private fills: Phaser.GameObjects.Rectangle[] = []
  private clockLabel!: Phaser.GameObjects.Text
  private warningOverlay!: Phaser.GameObjects.Rectangle
  private exhaustedText!: Phaser.GameObjects.Text
  private saveNotice!: Phaser.GameObjects.Text

  constructor() {
    super({ key: 'HUDScene' })
  }

  create(): void {
    const { width, height } = this.cameras.main

    // Clock label (top-left)
    this.clockLabel = this.add.text(BAR_X, 8, '', {
      fontSize: '11px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
    })

    // Stat bars
    BARS.forEach((def, i) => {
      const y = BAR_Y + i * (BAR_H + BAR_GAP)

      this.add.rectangle(BAR_X, y, BAR_W, BAR_H, 0x333333).setOrigin(0, 0)

      const fill = this.add.rectangle(BAR_X, y, BAR_W, BAR_H, def.color).setOrigin(0, 0)
      this.fills.push(fill)

      this.add.text(BAR_X + BAR_W + 4, y - 1, def.label, {
        fontSize: '7px',
        color: '#aaaaaa',
        stroke: '#000000',
        strokeThickness: 1,
      })
    })

    // Warning vignette overlay
    this.warningOverlay = this.add.rectangle(
      width / 2, height / 2, width, height, 0x000000, 0,
    )

    // Exhaustion message
    this.exhaustedText = this.add.text(width / 2, height / 2, '', {
      fontSize: '16px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
      align: 'center',
      wordWrap: { width: width - 80 },
    }).setOrigin(0.5)
    this.exhaustedText.setVisible(false)

    // Save notice (top-right, hidden)
    this.saveNotice = this.add.text(width - 10, 10, 'Saved', {
      fontSize: '10px',
      color: '#44DD44',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(1, 0).setAlpha(0)
  }

  update(): void {
    const gameScene = this.scene.get('GameScene') as GameScene
    if (!gameScene?.stats || !gameScene?.dayNight) return

    const stats = gameScene.stats
    const dayNight = gameScene.dayNight

    // Clock
    this.clockLabel.setText(dayNight.clockText)

    // Stat bars
    BARS.forEach((def, i) => {
      const fill = this.fills[i]
      if (!fill) return
      const value = stats[def.stat]
      fill.width = (value / 100) * BAR_W

      if (value < 15) fill.setFillStyle(0xdd2222)
      else if (value < 30) fill.setFillStyle(0xddaa22)
      else fill.setFillStyle(def.color)
    })

    // Warning vignette
    this.warningOverlay.setFillStyle(0x000000, stats.screenDarken ? 0.15 : 0)

    // Exhaustion prompt
    if (stats.collapsed) {
      this.exhaustedText.setText('Mamma Cat is exhausted.\nFind somewhere safe to rest.')
      this.exhaustedText.setVisible(true)
    } else {
      this.exhaustedText.setVisible(false)
    }
  }

  showSaveNotice(): void {
    this.saveNotice.setAlpha(1)
    this.tweens.add({
      targets: this.saveNotice,
      alpha: 0,
      delay: 800,
      duration: 600,
      ease: 'Linear',
    })
  }
}
