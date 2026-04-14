import Phaser from 'phaser'
import type { GameScene } from './GameScene'

const PANEL_X = 8
const PANEL_Y = 8
const PANEL_W = 160
const PANEL_PADDING = 10

const BAR_W = 100
const BAR_H = 10
const BAR_GAP = 6
const BAR_LABEL_W = 50

const REST_HOLD_MS = 2000

const FONT_FAMILY = 'Arial, Helvetica, sans-serif'

interface BarDef {
  stat: 'hunger' | 'thirst' | 'energy'
  color: number
  label: string
}

const BARS: BarDef[] = [
  { stat: 'hunger', color: 0xff8c00, label: 'Hunger' },
  { stat: 'thirst', color: 0x4488ff, label: 'Thirst' },
  { stat: 'energy', color: 0x88cc44, label: 'Energy' },
]

export class HUDScene extends Phaser.Scene {
  private fills: Phaser.GameObjects.Rectangle[] = []
  private barLabels: Phaser.GameObjects.Text[] = []
  private clockLabel!: Phaser.GameObjects.Text
  private warningOverlay!: Phaser.GameObjects.Rectangle
  private exhaustedText!: Phaser.GameObjects.Text
  private saveNotice!: Phaser.GameObjects.Text

  private restProgressBg!: Phaser.GameObjects.Arc
  private restProgressArc!: Phaser.GameObjects.Graphics
  private restLabel!: Phaser.GameObjects.Text

  private restingLabel!: Phaser.GameObjects.Text

  private pauseContainer!: Phaser.GameObjects.Container

  constructor() {
    super({ key: 'HUDScene' })
  }

  create(): void {
    const { width, height } = this.cameras.main

    // ──── Stats panel background ────
    const panelBg = this.add.graphics()
    const panelH = PANEL_PADDING + 20 + BARS.length * (BAR_H + BAR_GAP) + PANEL_PADDING - BAR_GAP
    panelBg.fillStyle(0x000000, 0.45)
    panelBg.fillRoundedRect(PANEL_X, PANEL_Y, PANEL_W, panelH, 6)

    // ──── Clock ────
    this.clockLabel = this.add.text(PANEL_X + PANEL_PADDING, PANEL_Y + PANEL_PADDING, '', {
      fontFamily: FONT_FAMILY,
      fontSize: '14px',
      color: '#ffffff',
    })

    // ──── Stat bars ────
    const barsStartY = PANEL_Y + PANEL_PADDING + 22

    BARS.forEach((def, i) => {
      const y = barsStartY + i * (BAR_H + BAR_GAP)
      const labelX = PANEL_X + PANEL_PADDING

      const label = this.add.text(labelX, y, def.label, {
        fontFamily: FONT_FAMILY,
        fontSize: '11px',
        color: '#cccccc',
      }).setOrigin(0, 0)
      this.barLabels.push(label)

      const barX = labelX + BAR_LABEL_W

      this.add.rectangle(barX, y + 1, BAR_W, BAR_H, 0x222222).setOrigin(0, 0)
      const fill = this.add.rectangle(barX, y + 1, BAR_W, BAR_H, def.color).setOrigin(0, 0)
      this.fills.push(fill)
    })

    // ──── Warning vignette ────
    this.warningOverlay = this.add.rectangle(
      width / 2, height / 2, width, height, 0x000000, 0,
    )

    // ──── Exhaustion message ────
    this.exhaustedText = this.add.text(width / 2, height / 2, '', {
      fontFamily: FONT_FAMILY,
      fontSize: '20px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4,
      align: 'center',
      wordWrap: { width: width - 100 },
    }).setOrigin(0.5).setVisible(false)

    // ──── Save notice ────
    this.saveNotice = this.add.text(width - 14, 14, 'Saved', {
      fontFamily: FONT_FAMILY,
      fontSize: '14px',
      color: '#44DD44',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(1, 0).setAlpha(0)

    // ──── Rest progress indicator ────
    this.restProgressBg = this.add.circle(width / 2, height / 2, 24, 0x000000, 0.5)
      .setVisible(false)
    this.restProgressArc = this.add.graphics().setVisible(false)
    this.restLabel = this.add.text(width / 2, height / 2, 'zzz', {
      fontFamily: FONT_FAMILY,
      fontSize: '13px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5).setVisible(false)

    // ──── Resting label ────
    this.restingLabel = this.add.text(width / 2, height * 0.35, 'Resting... press any key to wake', {
      fontFamily: FONT_FAMILY,
      fontSize: '16px',
      color: '#aaddff',
      stroke: '#000000',
      strokeThickness: 3,
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

    this.updateRestProgress(gameScene)
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
      this.restProgressArc.lineStyle(4, 0xaaddff, 0.9)
      this.restProgressArc.beginPath()
      const startAngle = -Math.PI / 2
      const endAngle = startAngle + (progress * Math.PI * 2)
      this.restProgressArc.arc(width / 2, height / 2, 20, startAngle, endAngle, false)
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

    const title = this.add.text(0, -80, 'PAUSED', {
      fontFamily: FONT_FAMILY,
      fontSize: '28px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5)

    const saveBtn = this.createMenuButton(0, -24, 'Save Game', () => {
      const gameScene = this.scene.get('GameScene') as GameScene
      gameScene.autoSave()
    })

    const resumeBtn = this.createMenuButton(0, 16, 'Resume', () => {
      const gameScene = this.scene.get('GameScene') as GameScene
      gameScene.resumeGame()
      this.pauseContainer.setVisible(false)
    })

    const quitBtn = this.createMenuButton(0, 56, 'Quit to Title', () => {
      const gameScene = this.scene.get('GameScene') as GameScene
      this.pauseContainer.setVisible(false)
      gameScene.quitToTitle()
    })

    return this.add.container(width / 2, height / 2, [
      overlay, title, saveBtn, resumeBtn, quitBtn,
    ])
  }

  private createMenuButton(x: number, y: number, label: string, callback: () => void): Phaser.GameObjects.Text {
    const btn = this.add.text(x, y, label, {
      fontFamily: FONT_FAMILY,
      fontSize: '18px',
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
