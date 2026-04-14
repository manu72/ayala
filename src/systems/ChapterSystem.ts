/**
 * Manages narrative chapter progression based on trust thresholds,
 * met-cat counts, and day survival. Chapters are triggered once and
 * persist across save/load via the registry.
 */

import type { TrustSystem } from "./TrustSystem";
import type { DayNightCycle } from "./DayNightCycle";

export interface ChapterDef {
  id: number;
  /** Conditions that must all be true to trigger this chapter. */
  conditions: (ctx: ChapterContext) => boolean;
  /** Narration lines shown when the chapter begins. */
  narration: string[];
}

interface ChapterContext {
  trust: TrustSystem;
  dayNight: DayNightCycle;
  knownCats: Set<string>;
  registry: Phaser.Data.DataManager;
}

const CHAPTERS: ChapterDef[] = [
  {
    id: 1,
    conditions: () => true,
    narration: [
      "A car door opens. Hands push you out. The door slams. The engine fades.",
      "The concrete is hot. The noise is deafening. Everything smells wrong.",
      "The green. Shelter.",
    ],
  },
  {
    id: 2,
    conditions: (ctx) => {
      const ch1Done = ctx.registry.get("CH1_RESTED") as boolean | undefined;
      return !!ch1Done && ctx.trust.global >= 25 && ctx.knownCats.size >= 2;
    },
    narration: [
      "Days pass. The gardens have a rhythm. You're learning it.",
    ],
  },
  {
    id: 3,
    conditions: (ctx) => {
      return (
        ctx.trust.global >= 50 &&
        ctx.knownCats.size >= 4 &&
        ctx.dayNight.dayCount >= 3
      );
    },
    narration: [
      "You know where the food is. You know who to avoid.",
      "But you don't have a place that's yours.",
    ],
  },
];

export class ChapterSystem {
  private current = 1;
  private pendingNarration: string[] | null = null;

  get chapter(): number {
    return this.current;
  }

  /** Returns narration lines if a new chapter just triggered, then clears them. */
  consumeNarration(): string[] | null {
    const lines = this.pendingNarration;
    this.pendingNarration = null;
    return lines;
  }

  restore(chapter: number): void {
    this.current = chapter;
  }

  /**
   * Check if conditions are met for the next chapter. Call periodically
   * (e.g. every few seconds, not every frame).
   */
  check(ctx: ChapterContext): boolean {
    const nextId = this.current + 1;
    const nextDef = CHAPTERS.find((ch) => ch.id === nextId);
    if (!nextDef) return false;

    if (nextDef.conditions(ctx)) {
      this.current = nextId;
      this.pendingNarration = nextDef.narration;
      ctx.registry.set("CHAPTER", this.current);
      return true;
    }
    return false;
  }

  /** Get the Chapter 1 intro narration (for new games only). */
  getIntroNarration(): string[] {
    return CHAPTERS[0]!.narration;
  }
}
