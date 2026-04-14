import Phaser from 'phaser'

export type TimeOfDay = 'dawn' | 'day' | 'evening' | 'night'

interface PhaseConfig {
  color: number
  alpha: number
  durationMs: number
  next: TimeOfDay
  /** In-game hour this phase starts at (for clock display) */
  startHour: number
}

const PHASES: Record<TimeOfDay, PhaseConfig> = {
  dawn:    { color: 0xffcc66, alpha: 0.05, durationMs: 90_000,  next: 'day',     startHour: 6  },
  day:     { color: 0xffffff, alpha: 0.08, durationMs: 120_000, next: 'evening', startHour: 10 },
  evening: { color: 0xff8c00, alpha: 0.15, durationMs: 90_000,  next: 'night',  startHour: 17 },
  night:   { color: 0x000033, alpha: 0.45, durationMs: 90_000,  next: 'dawn',   startHour: 21 },
}

const TRANSITION_MS = 8_000

export class DayNightCycle {
  private overlay: Phaser.GameObjects.Rectangle
  private phase: TimeOfDay = 'dawn'
  private phaseTimer = 0
  private label: Phaser.GameObjects.Text

  private transitioning = false
  private transitionTimer = 0
  private fromAlpha = 0
  private toAlpha = 0
  private fromColor = { r: 0, g: 0, b: 0 }
  private toColor = { r: 0, g: 0, b: 0 }

  /** Cumulative game time in ms since dawn of day 1, used for clock display */
  private gameTimeMs = 0

  constructor(scene: Phaser.Scene) {
    const cam = scene.cameras.main

    this.overlay = scene.add.rectangle(
      cam.width / 2,
      cam.height / 2,
      cam.width,
      cam.height,
      PHASES.dawn.color,
      PHASES.dawn.alpha,
    )
    this.overlay.setScrollFactor(0)
    this.overlay.setDepth(50)

    this.label = scene.add.text(8, 8, '', {
      fontSize: '11px',
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

  /** Returns true during the day phase (heat penalty period). */
  get isHeatActive(): boolean {
    return this.phase === 'day'
  }

  /** Fraction of current phase elapsed (0..1). */
  get phaseProgress(): number {
    return Math.min(this.phaseTimer / PHASES[this.phase].durationMs, 1)
  }

  /** Current in-game hour (6-24/0-5 range, float). */
  get gameHour(): number {
    const cfg = PHASES[this.phase]
    const nextCfg = PHASES[cfg.next]
    const hoursInPhase = ((nextCfg.startHour - cfg.startHour + 24) % 24) || 24
    return (cfg.startHour + hoursInPhase * this.phaseProgress) % 24
  }

  /** Formatted clock string, e.g. "Dawn 7:30 AM". */
  get clockText(): string {
    const h = this.gameHour
    const hour12 = Math.floor(h) % 12 || 12
    const mins = Math.floor((h % 1) * 60)
    const ampm = h >= 12 && h < 24 ? 'PM' : 'AM'
    const pad = mins < 10 ? '0' : ''
    const names: Record<TimeOfDay, string> = {
      dawn: 'Dawn', day: 'Day', evening: 'Evening', night: 'Night',
    }
    return `${names[this.phase]} ${hour12}:${pad}${mins} ${ampm}`
  }

  /** Restore from saved state. */
  restore(phase: TimeOfDay, gameTimeMs: number): void {
    this.phase = phase
    this.gameTimeMs = gameTimeMs
    this.phaseTimer = 0
    this.transitioning = false

    const cfg = PHASES[this.phase]
    this.overlay.setFillStyle(cfg.color, cfg.alpha)
    this.applyPhase()
  }

  get totalGameTimeMs(): number {
    return this.gameTimeMs
  }

  update(delta: number): void {
    this.gameTimeMs += delta

    if (this.transitioning) {
      this.transitionTimer += delta
      const t = Math.min(this.transitionTimer / TRANSITION_MS, 1)
      const easedT = t * t * (3 - 2 * t)

      const r = Math.round(this.fromColor.r + (this.toColor.r - this.fromColor.r) * easedT)
      const g = Math.round(this.fromColor.g + (this.toColor.g - this.fromColor.g) * easedT)
      const b = Math.round(this.fromColor.b + (this.toColor.b - this.fromColor.b) * easedT)
      const alpha = this.fromAlpha + (this.toAlpha - this.fromAlpha) * easedT

      this.overlay.setFillStyle((r << 16) | (g << 8) | b, alpha)

      if (t >= 1) {
        this.transitioning = false
      }
    }

    this.phaseTimer += delta
    if (this.phaseTimer >= PHASES[this.phase].durationMs) {
      this.phaseTimer -= PHASES[this.phase].durationMs
      this.cyclePhase()
    }

    this.label.setText(this.clockText)
  }

  private cyclePhase(): void {
    this.phase = PHASES[this.phase].next
    this.startTransition()
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
    this.label.setText(this.clockText)
  }
}
