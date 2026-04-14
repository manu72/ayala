import Phaser from "phaser";

export type TimeOfDay = "dawn" | "day" | "evening" | "night";

interface PhaseConfig {
  color: number;
  alpha: number;
  durationMs: number;
  next: TimeOfDay;
  startHour: number;
}

const PHASES: Record<TimeOfDay, PhaseConfig> = {
  dawn: { color: 0xffcc66, alpha: 0.05, durationMs: 90_000, next: "day", startHour: 6 },
  day: { color: 0xffffff, alpha: 0.08, durationMs: 120_000, next: "evening", startHour: 10 },
  evening: { color: 0xff8c00, alpha: 0.15, durationMs: 90_000, next: "night", startHour: 17 },
  night: { color: 0x000033, alpha: 0.45, durationMs: 90_000, next: "dawn", startHour: 21 },
};

const TRANSITION_MS = 8_000;

const FULL_CYCLE_MS =
  PHASES.dawn.durationMs + PHASES.day.durationMs +
  PHASES.evening.durationMs + PHASES.night.durationMs;

const PHASE_LABELS: Record<TimeOfDay, string> = {
  dawn: 'Dawn',
  day: 'Daytime',
  evening: 'Evening',
  night: 'Night',
}

export class DayNightCycle {
  private overlay: Phaser.GameObjects.Rectangle;
  private phase: TimeOfDay = "dawn";
  private phaseTimer = 0;

  private transitioning = false;
  private transitionTimer = 0;
  private fromAlpha = 0;
  private toAlpha = 0;
  private fromColor = { r: 0, g: 0, b: 0 };
  private toColor = { r: 0, g: 0, b: 0 };

  private gameTimeMs = 0;

  constructor(scene: Phaser.Scene) {
    const cam = scene.cameras.main;

    this.overlay = scene.add.rectangle(
      cam.width / 2,
      cam.height / 2,
      cam.width * 4,
      cam.height * 4,
      PHASES.dawn.color,
      PHASES.dawn.alpha,
    );
    this.overlay.setScrollFactor(0);
    this.overlay.setDepth(50);
  }

  get currentPhase(): TimeOfDay {
    return this.phase;
  }

  get isHeatActive(): boolean {
    return this.phase === "day";
  }

  get phaseProgress(): number {
    return Math.min(this.phaseTimer / PHASES[this.phase].durationMs, 1);
  }

  /** Number of full day/night cycles completed (1-indexed: starts on Day 1). */
  get dayCount(): number {
    return Math.floor(this.gameTimeMs / FULL_CYCLE_MS) + 1
  }

  get clockText(): string {
    return `${PHASE_LABELS[this.phase]}  Day ${this.dayCount}`
  }

  restore(phase: TimeOfDay, gameTimeMs: number): void {
    this.phase = phase;
    this.gameTimeMs = gameTimeMs;
    this.transitioning = false;

    // Compute intra-phase progress from gameTimeMs
    const PHASE_ORDER: TimeOfDay[] = ['dawn', 'day', 'evening', 'night'];
    const cycleOffset = gameTimeMs % FULL_CYCLE_MS;
    let accumulated = 0;
    for (const p of PHASE_ORDER) {
      const dur = PHASES[p].durationMs;
      if (p === phase) {
        this.phaseTimer = Math.max(0, cycleOffset - accumulated);
        break;
      }
      accumulated += dur;
    }

    const cfg = PHASES[this.phase];
    this.overlay.setFillStyle(cfg.color, cfg.alpha);
  }

  get totalGameTimeMs(): number {
    return this.gameTimeMs;
  }

  update(delta: number): void {
    this.gameTimeMs += delta;

    if (this.transitioning) {
      this.transitionTimer += delta;
      const t = Math.min(this.transitionTimer / TRANSITION_MS, 1);
      const easedT = t * t * (3 - 2 * t);

      const r = Math.round(this.fromColor.r + (this.toColor.r - this.fromColor.r) * easedT);
      const g = Math.round(this.fromColor.g + (this.toColor.g - this.fromColor.g) * easedT);
      const b = Math.round(this.fromColor.b + (this.toColor.b - this.fromColor.b) * easedT);
      const alpha = this.fromAlpha + (this.toAlpha - this.fromAlpha) * easedT;

      this.overlay.setFillStyle((r << 16) | (g << 8) | b, alpha);

      if (t >= 1) {
        this.transitioning = false;
      }
    }

    this.phaseTimer += delta;
    while (this.phaseTimer >= PHASES[this.phase].durationMs) {
      this.phaseTimer -= PHASES[this.phase].durationMs;
      this.cyclePhase();
    }
  }

  private cyclePhase(): void {
    this.phase = PHASES[this.phase].next;
    this.startTransition();
  }

  private startTransition(): void {
    const oldColor = this.overlay.fillColor;
    this.fromColor = {
      r: (oldColor >> 16) & 0xff,
      g: (oldColor >> 8) & 0xff,
      b: oldColor & 0xff,
    };
    this.fromAlpha = this.overlay.fillAlpha;

    const target = PHASES[this.phase];
    this.toColor = {
      r: (target.color >> 16) & 0xff,
      g: (target.color >> 8) & 0xff,
      b: target.color & 0xff,
    };
    this.toAlpha = target.alpha;

    this.transitioning = true;
    this.transitionTimer = 0;
  }
}
