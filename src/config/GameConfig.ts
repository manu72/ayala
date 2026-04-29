import Phaser from 'phaser'
import { BootScene } from '../scenes/BootScene'
import { StartScene } from '../scenes/StartScene'
import { GameScene } from '../scenes/GameScene'
import { HUDScene } from '../scenes/HUDScene'
import { JournalScene } from '../scenes/JournalScene'
import { EpilogueScene } from '../scenes/EpilogueScene'
import { GameOverScene } from '../scenes/GameOverScene'

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: 816,
  height: 624,
  pixelArt: true,
  input: {
    // Touch controls need one pointer for the joystick and one for action buttons.
    activePointers: 2,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scene: [BootScene, StartScene, GameScene, HUDScene, JournalScene, EpilogueScene, GameOverScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
}
