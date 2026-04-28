import { SCORING_WEIGHTS } from "../config/scoringWeights";
import type { TrustEvent } from "./TrustSystem";

export interface RunScoreState {
  catEngagements: number;
  humanEngagements: number;
  cleanNights: number;
  nightsSurvived: number;
  distanceTravelledPx: number;
  totalExplorableCells: number;
  visitedCells: number[];
  closeFriendsMade: number;
  dumpedPetsComforted: number[];
  foodSourcesDiscovered: string[];
  runSnatchCount: number;
}

export interface ScoreBreakdownItem {
  label: string;
  value: number;
  points: number;
}

export interface TerritoryScoreBreakdownItem extends ScoreBreakdownItem {
  percent: number;
}

export interface ScoreBreakdown {
  catEngagement: ScoreBreakdownItem;
  humanEngagement: ScoreBreakdownItem;
  cleanNights: ScoreBreakdownItem;
  nightsSurvived: ScoreBreakdownItem;
  distanceTravelled: ScoreBreakdownItem;
  territoryExplored: TerritoryScoreBreakdownItem;
  closeFriends: ScoreBreakdownItem;
  dumpedPetsComforted: ScoreBreakdownItem;
  foodSourcesDiscovered: ScoreBreakdownItem;
}

export function createDefaultRunScoreState(): RunScoreState {
  return {
    catEngagements: 0,
    humanEngagements: 0,
    cleanNights: 0,
    nightsSurvived: 0,
    distanceTravelledPx: 0,
    totalExplorableCells: 0,
    visitedCells: [],
    closeFriendsMade: 0,
    dumpedPetsComforted: [],
    foodSourcesDiscovered: [],
    runSnatchCount: 0,
  };
}

export const DEFAULT_RUN_SCORE_STATE: RunScoreState = createDefaultRunScoreState();

export function calculateTerritoryScore(coveragePercent: number, maxPoints = SCORING_WEIGHTS.territoryMax): number {
  const clampedPercent = clamp(coveragePercent, 0, 100);
  return Math.floor(Math.sqrt(clampedPercent / 100) * Math.max(0, maxPoints));
}

export class ScoringSystem {
  private state: Omit<RunScoreState, "visitedCells" | "dumpedPetsComforted" | "foodSourcesDiscovered"> = {
    catEngagements: 0,
    humanEngagements: 0,
    cleanNights: 0,
    nightsSurvived: 0,
    distanceTravelledPx: 0,
    totalExplorableCells: 0,
    closeFriendsMade: 0,
    runSnatchCount: 0,
  };

  private visitedCells = new Set<number>();
  private dumpedPetsComforted = new Set<number>();
  private foodSourcesDiscovered = new Set<string>();
  private suspended = false;

  constructor(data?: Partial<RunScoreState>) {
    if (data) this.fromJSON(data);
  }

  get total(): number {
    return Object.values(this.getBreakdown()).reduce((sum, item) => sum + item.points, 0);
  }

  get territoryPercent(): number {
    if (this.state.totalExplorableCells <= 0) return 0;
    return clamp((this.visitedCells.size / this.state.totalExplorableCells) * 100, 0, 100);
  }

  suspend(): void {
    this.suspended = true;
  }

  resume(): void {
    this.suspended = false;
  }

  recordCatEngagement(count = 1): void {
    this.increment("catEngagements", count);
  }

  recordHumanEngagement(count = 1): void {
    this.increment("humanEngagements", count);
  }

  recordTrustEvent(event: TrustEvent): void {
    switch (event.type) {
      case "cat:first-conversation":
      case "cat:return-conversation":
      case "cat:proximity-tick":
      case "cat:seen-eating":
      case "cat:collapse-witness":
        this.recordCatEngagement();
        break;
      case "survival:day":
        // Survival scoring is driven by DayNightCycle.newDay so trust seeding
        // and New Game+ setup cannot double-count nights.
        break;
    }
  }

  recordNightSurvived({ clean }: { clean: boolean }): void {
    if (this.suspended) return;
    this.state.nightsSurvived += 1;
    if (clean) this.state.cleanNights += 1;
  }

  recordSnatch(): void {
    this.increment("runSnatchCount", 1);
  }

  addDistance(px: number): void {
    if (this.suspended || !Number.isFinite(px) || px <= 0) return;
    this.state.distanceTravelledPx += px;
  }

  setTotalExplorableCells(total: number): void {
    this.state.totalExplorableCells = sanitizeNonNegativeInt(total);
  }

  visitCell(cellKey: number): void {
    if (this.suspended) return;
    const key = sanitizeNonNegativeInt(cellKey);
    if (key >= 0) this.visitedCells.add(key);
  }

  setCloseFriendsMade(count: number): void {
    this.state.closeFriendsMade = sanitizeNonNegativeInt(count);
  }

  recordDumpedPetComforted(eventId: number): void {
    if (this.suspended) return;
    const id = sanitizeNonNegativeInt(eventId);
    if (id >= 1 && id <= 3) this.dumpedPetsComforted.add(id);
  }

  discoverFoodSource(key: string): void {
    if (this.suspended) return;
    const trimmed = key.trim();
    if (trimmed.length > 0) this.foodSourcesDiscovered.add(trimmed);
  }

  getBreakdown(): ScoreBreakdown {
    const territoryPercent = this.territoryPercent;
    const distanceThousands = Math.floor(this.state.distanceTravelledPx / 1000);

    return {
      catEngagement: {
        label: "Cat engagement",
        value: this.state.catEngagements,
        points: this.state.catEngagements * SCORING_WEIGHTS.catEngagement,
      },
      humanEngagement: {
        label: "Human engagement",
        value: this.state.humanEngagements,
        points: this.state.humanEngagements * SCORING_WEIGHTS.humanEngagement,
      },
      cleanNights: {
        label: "Clean nights",
        value: this.state.cleanNights,
        points: this.state.cleanNights * SCORING_WEIGHTS.cleanNight,
      },
      nightsSurvived: {
        label: "Nights survived",
        value: this.state.nightsSurvived,
        points: this.state.nightsSurvived * SCORING_WEIGHTS.nightSurvived,
      },
      distanceTravelled: {
        label: "Distance travelled",
        value: this.state.distanceTravelledPx,
        points: distanceThousands * SCORING_WEIGHTS.distancePerThousandPx,
      },
      territoryExplored: {
        label: "Territory explored",
        value: this.visitedCells.size,
        percent: territoryPercent,
        points: calculateTerritoryScore(territoryPercent),
      },
      closeFriends: {
        label: "Close friends",
        value: this.state.closeFriendsMade,
        points: this.state.closeFriendsMade * SCORING_WEIGHTS.closeFriend,
      },
      dumpedPetsComforted: {
        label: "Dumped pets comforted",
        value: this.dumpedPetsComforted.size,
        points: this.dumpedPetsComforted.size * SCORING_WEIGHTS.dumpedPetComforted,
      },
      foodSourcesDiscovered: {
        label: "Food sources discovered",
        value: this.foodSourcesDiscovered.size,
        points: this.foodSourcesDiscovered.size * SCORING_WEIGHTS.foodSourceDiscovered,
      },
    };
  }

  toJSON(): RunScoreState {
    return {
      ...this.state,
      distanceTravelledPx: roundToThreeDecimals(this.state.distanceTravelledPx),
      visitedCells: [...this.visitedCells].sort((a, b) => a - b),
      dumpedPetsComforted: [...this.dumpedPetsComforted].sort((a, b) => a - b),
      foodSourcesDiscovered: [...this.foodSourcesDiscovered].sort(),
    };
  }

  fromJSON(data: Partial<RunScoreState>): void {
    this.state = {
      catEngagements: sanitizeNonNegativeInt(data.catEngagements),
      humanEngagements: sanitizeNonNegativeInt(data.humanEngagements),
      cleanNights: sanitizeNonNegativeInt(data.cleanNights),
      nightsSurvived: sanitizeNonNegativeInt(data.nightsSurvived),
      distanceTravelledPx: sanitizeNonNegativeNumber(data.distanceTravelledPx),
      totalExplorableCells: sanitizeNonNegativeInt(data.totalExplorableCells),
      closeFriendsMade: sanitizeNonNegativeInt(data.closeFriendsMade),
      runSnatchCount: sanitizeNonNegativeInt(data.runSnatchCount),
    };

    this.visitedCells = new Set(sanitizeNumberArray(data.visitedCells));
    this.dumpedPetsComforted = new Set(sanitizeNumberArray(data.dumpedPetsComforted).filter((id) => id >= 1 && id <= 3));
    this.foodSourcesDiscovered = new Set((data.foodSourcesDiscovered ?? []).filter(isNonEmptyString));
    this.suspended = false;
  }

  private increment(key: keyof typeof this.state, amount: number): void {
    if (this.suspended) return;
    const safeAmount = sanitizeNonNegativeInt(amount);
    if (safeAmount <= 0) return;
    this.state[key] += safeAmount;
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function sanitizeNonNegativeInt(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}

function sanitizeNonNegativeNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return 0;
  return value;
}

function sanitizeNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is number => typeof entry === "number" && Number.isFinite(entry) && entry >= 0)
    .map((entry) => Math.floor(entry));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function roundToThreeDecimals(value: number): number {
  return Math.round(value * 1000) / 1000;
}
