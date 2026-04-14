import Phaser from 'phaser'
import { SaveSystem } from '../systems/SaveSystem'

/**
 * Start screen shown before the game begins.
 * Offers "Continue" (if a save exists) and "New Game".
 */
export class StartScene extends Phaser.Scene {
  constructor() {
    super({ key: 'StartScene' })
  }

  create(): void {
    const { width, height } = this.cameras.main

    // Background
    this.cameras.main.setBackgroundColor('#111111')

    // Title
    this.add.text(width / 2, height * 0.30, 'AYALA', {
      fontSize: '40px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5)

    // Subtitle
    this.add.text(width / 2, height * 0.38, 'A story about finding home', {
      fontSize: '14px',
      color: '#888888',
    }).setOrigin(0.5)

    let nextY = height * 0.55
    const hasSave = SaveSystem.hasSave()

    if (hasSave) {
      const continueBtn = this.add.text(width / 2, nextY, 'Continue', {
        fontSize: '20px',
        color: '#44DD44',
      }).setOrigin(0.5).setInteractive({ useHandCursor: true })

      continueBtn.on('pointerover', () => continueBtn.setColor('#66FF66'))
      continueBtn.on('pointerout', () => continueBtn.setColor('#44DD44'))
      continueBtn.on('pointerdown', () => {
        this.scene.start('GameScene', { loadSave: true })
      })

      nextY += 40
    }

    const newBtn = this.add.text(width / 2, nextY, 'New Game', {
      fontSize: '20px',
      color: '#ffffff',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })

    newBtn.on('pointerover', () => newBtn.setColor('#cccccc'))
    newBtn.on('pointerout', () => newBtn.setColor('#ffffff'))
    newBtn.on('pointerdown', () => {
      SaveSystem.clear()
      this.scene.start('GameScene', { loadSave: false })
    })

    // Keyboard shortcuts
    if (this.input.keyboard) {
      this.input.keyboard.on('keydown-ENTER', () => {
        if (hasSave) {
          this.scene.start('GameScene', { loadSave: true })
        } else {
          this.scene.start('GameScene', { loadSave: false })
        }
      })

      this.input.keyboard.on('keydown-N', () => {
        SaveSystem.clear()
        this.scene.start('GameScene', { loadSave: false })
      })
    }

    // Hint
    const hint = hasSave ? 'Enter = Continue  |  N = New Game' : 'Enter = Start'
    this.add.text(width / 2, height * 0.85, hint, {
      fontSize: '10px',
      color: '#555555',
    }).setOrigin(0.5)
  }
}
