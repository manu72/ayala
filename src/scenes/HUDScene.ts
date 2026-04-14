import Phaser from 'phaser'
import type { GameScene } from './GameScene'

const BAR_W = 60
const BAR_H = 6
const BAR_GAP = 3
const BAR_X = 10
const BAR_Y = 22
const REST_HOLD_MS = 2000

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

  // Rest progress ring
  private restProgressBg!: Phaser.GameObjects.Arc
  private restProgressArc!: Phaser.GameObjects.Graphics
  private restLabel!: Phaser.GameObjects.Text

  // Resting indicator (while sleeping)
  private restingLabel!: Phaser.GameObjects.Text

  // Pause menu
  private pauseContainer!: Phaser.GameObjects.Container

  constructor() {
    super({ key: 'HUDScene' })
  }

  create(): void {
    const { width, height } = this.cameras.main

    this.clockLabel = this.add.text(BAR_X, 8, '', {
      fontSize: '11px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
    })

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

    this.warningOverlay = this.add.rectangle(
      width / 2, height / 2, width, height, 0x000000, 0,
    )

    this.exhaustedText = this.add.text(width / 2, height / 2, '', {
      fontSize: '16px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
      align: 'center',
      wordWrap: { width: width - 80 },
    }).setOrigin(0.5).setVisible(false)

    this.saveNotice = this.add.text(width - 10, 10, 'Saved', {
      fontSize: '10px',
      color: '#44DD44',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(1, 0).setAlpha(0)

    // ──── Rest progress indicator (centre of screen) ────
    this.restProgressBg = this.add.circle(width / 2, height / 2, 18, 0x000000, 0.5)
      .setVisible(false)
    this.restProgressArc = this.add.graphics().setVisible(false)
    this.restLabel = this.add.text(width / 2, height / 2, 'zzz', {
      fontSize: '10px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5).setVisible(false)

    // ──── Resting (sleeping) label ────
    this.restingLabel = this.add.text(width / 2, height * 0.35, 'Resting... (press any key to wake)', {
      fontSize: '12px',
      color: '#aaddff',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5).setVisible(false)

    // ──── Pause menu ────
    this.pauseContainer = this.createPauseMenu(width, height)
    this.pauseContainer.setVisible(false)
    this.pauseContainer.setDepth(200)
  }

  update(): void {
    const gameScene = this.scene.get('GameScene') as GameScene
    if (!gameScene?.stats || !gameScene?.dayNight) return

    const stats = gameScene.stats
    const dayNight = gameScene.dayNight

    this.clockLabel.setText(dayNight.clockText)

    BARS.forEach((def, i) => {
      const fill = this.fills[i]
      if (!fill) return
      const value = stats[def.stat]
      fill.width = (value / 100) * BAR_W
      if (value < 15) fill.setFillStyle(0xdd2222)
      else if (value < 30) fill.setFillStyle(0xddaa22)
      else fill.setFillStyle(def.color)
    })

    this.warningOverlay.setFillStyle(0x000000, stats.screenDarken ? 0.15 : 0)

    if (stats.collapsed) {
      this.exhaustedText.setText('Mamma Cat is exhausted.\nFind somewhere safe to rest.')
      this.exhaustedText.setVisible(true)
    } else {
      this.exhaustedText.setVisible(false)
    }

    // Rest hold progress
    this.updateRestProgress(gameScene)

    // Resting indicator
    this.restingLabel.setVisible(gameScene.player?.isResting ?? false)
  }

  private updateRestProgress(gameScene: GameScene): void {
    const { width, height } = this.cameras.main

    if (gameScene.restHoldActive && gameScene.restHoldTimer > 0) {
      const progress = Math.min(gameScene.restHoldTimer / REST_HOLD_MS, 1)
      this.restProgressBg.setVisible(true)
      this.restProgressArc.setVisible(true)
      this.restLabel.setVisible(true)

      this.restProgressArc.clear()
      this.restProgressArc.lineStyle(3, 0xaaddff, 0.9)
      this.restProgressArc.beginPath()
      const startAngle = -Math.PI / 2
      const endAngle = startAngle + (progress * Math.PI * 2)
      this.restProgressArc.arc(width / 2, height / 2, 16, startAngle, endAngle, false)
      this.restProgressArc.strokePath()
    } else {
      this.restProgressBg.setVisible(false)
      this.restProgressArc.setVisible(false)
      this.restLabel.setVisible(false)
    }
  }

  // ──────────── Pause Menu ────────────

  private createPauseMenu(width: number, height: number): Phaser.GameObjects.Container {
    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.6)

    const title = this.add.text(0, -70, 'PAUSED', {
      fontSize: '24px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5)

    const saveBtn = this.createMenuButton(0, -20, 'Save Game', () => {
      const gameScene = this.scene.get('GameScene') as GameScene
      gameScene.autoSave()
    })

    const resumeBtn = this.createMenuButton(0, 20, 'Resume', () => {
      const gameScene = this.scene.get('GameScene') as GameScene
      gameScene.resumeGame()
      this.pauseContainer.setVisible(false)
    })

    const quitBtn = this.createMenuButton(0, 60, 'Quit to Title', () => {
      const gameScene = this.scene.get('GameScene') as GameScene
      this.pauseContainer.setVisible(false)
      gameScene.quitToTitle()
    })

    const container = this.add.container(width / 2, height / 2, [
      overlay, title, saveBtn, resumeBtn, quitBtn,
    ])
    return container
  }

  private createMenuButton(x: number, y: number, label: string, callback: () => void): Phaser.GameObjects.Text {
    const btn = this.add.text(x, y, label, {
      fontSize: '16px',
      color: '#cccccc',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })

    btn.on('pointerover', () => btn.setColor('#ffffff'))
    btn.on('pointerout', () => btn.setColor('#cccccc'))
    btn.on('pointerdown', callback)
    return btn
  }

  showPauseMenu(): void {
    this.pauseContainer.setVisible(true)
  }

  hidePauseMenu(): void {
    this.pauseContainer.setVisible(false)
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
