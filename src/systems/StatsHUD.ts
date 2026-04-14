import Phaser from 'phaser'
import type { StatsSystem } from './StatsSystem'

const BAR_W = 60
const BAR_H = 6
const BAR_GAP = 2
const BAR_X = 10
const BAR_Y = 24

interface BarDef {
  stat: 'hunger' | 'thirst' | 'energy'
  color: number
}

const BARS: BarDef[] = [
  { stat: 'hunger', color: 0xff8c00 },
  { stat: 'thirst', color: 0x4488ff },
  { stat: 'energy', color: 0x88cc44 },
]

/**
 * Minimal camera-fixed HUD showing three stat bars.
 * Positioned just below the day/night clock label.
 */
export class StatsHUD {
  private container: Phaser.GameObjects.Container
  private fills: Phaser.GameObjects.Rectangle[] = []
  private warningOverlay: Phaser.GameObjects.Rectangle
  private exhaustedText: Phaser.GameObjects.Text

  constructor(scene: Phaser.Scene) {
    const cam = scene.cameras.main
    this.container = scene.add.container(0, 0)
    this.container.setScrollFactor(0)
    this.container.setDepth(52)

    BARS.forEach((def, i) => {
      const y = BAR_Y + i * (BAR_H + BAR_GAP)

      const bg = scene.add.rectangle(BAR_X, y, BAR_W, BAR_H, 0x333333)
        .setOrigin(0, 0)

      const fill = scene.add.rectangle(BAR_X, y, BAR_W, BAR_H, def.color)
        .setOrigin(0, 0)

      const label = scene.add.text(BAR_X + BAR_W + 4, y - 1, def.stat[0]!.toUpperCase(), {
        fontSize: '7px',
        color: '#aaaaaa',
      })

      this.container.add([bg, fill, label])
      this.fills.push(fill)
    })

    // Screen-edge darkening overlay for critical stats
    this.warningOverlay = scene.add.rectangle(
      cam.width / 2, cam.height / 2, cam.width, cam.height,
      0x000000, 0,
    )
    this.warningOverlay.setScrollFactor(0)
    this.warningOverlay.setDepth(49)

    // Exhaustion message
    this.exhaustedText = scene.add.text(cam.width / 2, cam.height / 2, '', {
      fontSize: '14px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
      align: 'center',
      wordWrap: { width: cam.width - 80 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(200)
    this.exhaustedText.setVisible(false)
  }

  update(stats: StatsSystem): void {
    BARS.forEach((def, i) => {
      const fill = this.fills[i]
      if (!fill) return
      const value = stats[def.stat]
      fill.width = (value / 100) * BAR_W

      // Colour shifts to red when critically low
      if (value < 15) {
        fill.setFillStyle(0xdd2222)
      } else if (value < 30) {
        fill.setFillStyle(0xddaa22)
      } else {
        fill.setFillStyle(def.color)
      }
    })

    // Warning vignette
    this.warningOverlay.setFillStyle(0x000000, stats.screenDarken ? 0.15 : 0)

    // Exhaustion prompt
    if (stats.collapsed) {
      this.exhaustedText.setText(
        'Mamma Cat is exhausted.\nFind somewhere safe to rest.',
      )
      this.exhaustedText.setVisible(true)
    } else {
      this.exhaustedText.setVisible(false)
    }
  }
}
