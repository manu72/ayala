import Phaser from 'phaser'

export type TimeOfDay = 'dawn' | 'day' | 'evening' | 'night'

interface PhaseConfig {
  color: number
  alpha: number
  next: TimeOfDay
}

const PHASES: Record<TimeOfDay, PhaseConfig> = {
  dawn:    { color: 0xffcc66, alpha: 0.08, next: 'day' },
  day:     { color: 0x000000, alpha: 0.00, next: 'evening' },
  evening: { color: 0xff8c00, alpha: 0.15, next: 'night' },
  night:   { color: 0x000033, alpha: 0.40, next: 'dawn' },
}

// 60 seconds per phase for testing; tune later
const PHASE_DURATION_MS = 60_000
const TRANSITION_MS = 2_000

export class DayNightCycle {
  private overlay: Phaser.GameObjects.Rectangle
  private phase: TimeOfDay = 'day'
  private timer = 0
  private label: Phaser.GameObjects.Text

  // Tweening state
  private transitioning = false
  private transitionTimer = 0
  private fromAlpha = 0
  private toAlpha = 0
  private fromColor = { r: 0, g: 0, b: 0 }
  private toColor = { r: 0, g: 0, b: 0 }

  constructor(scene: Phaser.Scene) {
    const cam = scene.cameras.main

    this.overlay = scene.add.rectangle(
      cam.width / 2,
      cam.height / 2,
      cam.width,
      cam.height,
      0x000000,
      0,
    )
    this.overlay.setScrollFactor(0)
    this.overlay.setDepth(50)

    this.label = scene.add.text(8, 8, '', {
      fontSize: '12px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
    })
    this.label.setScrollFactor(0)
    this.label.setDepth(51)

    this.applyPhase()
  }

  get currentPhase(): TimeOfDay {
    return this.phase
  }

  update(delta: number): void {
    if (this.transitioning) {
      this.transitionTimer += delta
      const t = Math.min(this.transitionTimer / TRANSITION_MS, 1)
      const easedT = t * t * (3 - 2 * t) // smoothstep

      const r = Math.round(this.fromColor.r + (this.toColor.r - this.fromColor.r) * easedT)
      const g = Math.round(this.fromColor.g + (this.toColor.g - this.fromColor.g) * easedT)
      const b = Math.round(this.fromColor.b + (this.toColor.b - this.fromColor.b) * easedT)
      const alpha = this.fromAlpha + (this.toAlpha - this.fromAlpha) * easedT

      this.overlay.setFillStyle((r << 16) | (g << 8) | b, alpha)

      if (t >= 1) {
        this.transitioning = false
      }
      return
    }

    this.timer += delta
    if (this.timer >= PHASE_DURATION_MS) {
      this.timer = 0
      this.cyclePhase()
    }
  }

  private cyclePhase(): void {
    const current = PHASES[this.phase]
    this.phase = current.next
    this.startTransition()
    this.applyPhase()
  }

  private startTransition(): void {
    const oldColor = this.overlay.fillColor
    this.fromColor = {
      r: (oldColor >> 16) & 0xff,
      g: (oldColor >> 8) & 0xff,
      b: oldColor & 0xff,
    }
    this.fromAlpha = this.overlay.fillAlpha

    const target = PHASES[this.phase]
    this.toColor = {
      r: (target.color >> 16) & 0xff,
      g: (target.color >> 8) & 0xff,
      b: target.color & 0xff,
    }
    this.toAlpha = target.alpha

    this.transitioning = true
    this.transitionTimer = 0
  }

  private applyPhase(): void {
    const names: Record<TimeOfDay, string> = {
      dawn: 'Dawn',
      day: 'Day',
      evening: 'Evening',
      night: 'Night',
    }
    this.label.setText(names[this.phase])
  }
}
