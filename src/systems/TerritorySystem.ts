/**
 * Territory claiming + map-exploration management.
 *
 * v1 supports a single territory: The Shops / Pyramid Steps. Claiming
 * grants gameplay benefits: safe sleep, food proximity, shelter.
 *
 * The system also owns the flood-filled reachable-cell set used by the
 * exploration score — a Commit D fold-in to keep all map-coverage state
 * in one place and off `GameScene`. The scene still defines what
 * "blocked" means (via the `isBlocked` callback, which walks the
 * ground + objects tilemap layers) because the same predicate feeds
 * snatcher navigation clearance; we just accept it as a parameter so
 * this system doesn't grow a Phaser-tilemap dependency.
 */

import { computeReachableCells, getCellKey } from "../utils/mapExploration";

export interface Territory {
  name: string;
  zone: string;
  claimed: boolean;
  claimedOnDay: number;
  benefits: string[];
}

export class TerritorySystem {
  private territory: Territory = {
    name: "The Shops",
    zone: "zone_6_shops",
    claimed: false,
    claimedOnDay: 0,
  benefits: ["safe_sleep", "food_proximity", "shelter"],
  };

  /**
   * Flood-filled set of navigable tile-cell keys. Used both to cap the
   * exploration score (`scoring.setTotalExplorableCells`) and to test
   * whether the player's current cell is explorable at all — cells that
   * were unreachable from the spawn (e.g. walled-off islands across an
   * impassable boundary) should not count.
   */
  private reachableCells: Set<number> = new Set();

  get isClaimed(): boolean {
    return this.territory.claimed;
  }

  get claimedOnDay(): number {
    return this.territory.claimedOnDay;
  }

  claim(gameDay: number): void {
    this.territory.claimed = true;
    this.territory.claimedOnDay = gameDay;
  }

  /**
   * Flood-fill the reachable-cell set from the player's spawn. Returns
   * the total count so the caller can feed it to the scoring system in
   * the same step.
   */
  initialiseExploration(options: {
    width: number;
    height: number;
    startX: number;
    startY: number;
    isBlocked: (tileX: number, tileY: number) => boolean;
  }): number {
    this.reachableCells = computeReachableCells(options);
    return this.reachableCells.size;
  }

  /**
   * Check whether the given tile is a known-reachable cell. Used by the
   * scene's "player just moved" hook to decide if a `scoring.visitCell`
   * credit should fire. Returns the packed cell key on a hit, or `null`
   * when the cell is off-grid or walled-off.
   */
  visitCell(tileX: number, tileY: number, mapWidth: number): number | null {
    if (this.reachableCells.size === 0) return null;
    const key = getCellKey(tileX, tileY, mapWidth);
    return this.reachableCells.has(key) ? key : null;
  }

  /** Total number of flood-filled cells; mirrors the scoring cap. */
  get totalExplorableCells(): number {
    return this.reachableCells.size;
  }

  toJSON(): { claimed: boolean; claimedOnDay: number } {
    return {
      claimed: this.territory.claimed,
      claimedOnDay: this.territory.claimedOnDay,
    };
  }

  fromJSON(data: { claimed?: boolean; claimedOnDay?: number }): void {
    if (typeof data.claimed === "boolean") {
      this.territory.claimed = data.claimed;
    }
    if (typeof data.claimedOnDay === "number" && Number.isFinite(data.claimedOnDay)) {
      this.territory.claimedOnDay = data.claimedOnDay;
    }
  }
}
