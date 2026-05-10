/**
 * Manages narrative chapter progression based on trust thresholds,
 * met-cat counts, day survival, territory, and encounter states.
 * Chapters are triggered once and persist across save/load via the registry.
 */

import type { TrustSystem } from "./TrustSystem";
import type { DayNightCycle } from "./DayNightCycle";
import type { TerritorySystem } from "./TerritorySystem";
import { StoryKeys } from "../registry/storyKeys";

export interface ChapterDef {
  id: number;
  /** Conditions that must all be true to trigger this chapter. */
  conditions: (ctx: ChapterContext) => boolean;
  /** Narration lines shown when the chapter begins. */
  narration: string[];
}

export interface ChapterContext {
  trust: TrustSystem;
  dayNight: DayNightCycle;
  /**
   * Named cats Mamma Cat has actually conversed with at least once.
   * Built from per-cat dialogue registry flags (`MET_BLACKY`, `TIGER_TALKS`,
   * `JAYCO_TALKS`, …) — *not* from proximity-only name reveals. Chapter
   * progression deliberately requires deliberate engagement, not passive
   * sightings, so passively walking past the central area cannot satisfy
   * a chapter gate. See `GameScene.buildSpokenNamedCats`.
   */
  spokenCats: Set<string>;
  registry: Phaser.Data.DataManager;
  territory: TerritorySystem;
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
      return !!ch1Done && ctx.trust.global >= 25 && ctx.spokenCats.size >= 2;
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
        ctx.spokenCats.size >= 4 &&
        ctx.dayNight.dayCount >= 3
      );
    },
    narration: [
      "You know where the food is. You know who to avoid.",
      "But you don't have a place that's yours.",
    ],
  },
  {
    id: 4,
    conditions: (ctx) => {
      const visitedShops = ctx.registry.get("VISITED_ZONE_6") as boolean | undefined;
      return ctx.trust.global >= 80 && !!visitedShops;
    },
    narration: [
      "The steps near the glass building. Warm air rises from below. The smell of food. Shelter from the rain.",
      "This could be yours.",
    ],
  },
  {
    id: 5,
    conditions: (ctx) => {
      return (
        ctx.trust.global >= 90 &&
        ctx.territory.isClaimed &&
        ctx.dayNight.dayCount >= 5
      );
    },
    narration: [
      "You have a home now. A place in the steps. But something is changing.",
      "A new human has been visiting the gardens. She moves differently from the others.",
    ],
  },
  {
    id: 6,
    conditions: (ctx) => {
      return ctx.registry.get(StoryKeys.ENCOUNTER_5_COMPLETE) === true;
    },
    narration: [],
  },
];

const CHAPTER_TITLES: Record<number, string> = {
  1: "Abandoned",
  2: "Newcomer",
  3: "Finding Her Place",
  4: "Territory",
  5: "The Human",
  6: "Home",
};

const CHAPTER_HINTS: Record<number, string> = {
  1: "Find food, water, and somewhere safe to rest",
  2: "Meet the cats of the gardens",
  3: "Explore beyond the central gardens",
  4: "Find a place to call your own",
  5: "Build trust with the new human visitor",
  6: "Go home",
};

export class ChapterSystem {
  private current = 1;
  private pendingNarration: string[] | null = null;

  get chapter(): number {
    return this.current;
  }

  get title(): string {
    return CHAPTER_TITLES[this.current] ?? "";
  }

  get hint(): string {
    return CHAPTER_HINTS[this.current] ?? "";
  }

  get titleCard(): string {
    return `Chapter ${this.current}: ${this.title}`;
  }

  /** Returns narration lines if a new chapter just triggered, then clears them. */
  consumeNarration(): string[] | null {
    const lines = this.pendingNarration;
    this.pendingNarration = null;
    return lines;
  }

  restore(chapter: number): void {
    const maxChapter = CHAPTERS.length;
    const val = Number.isFinite(chapter) ? Math.floor(chapter) : 1;
    this.current = Math.max(1, Math.min(maxChapter, val));
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
