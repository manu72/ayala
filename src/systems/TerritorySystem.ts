/**
 * Territory claiming and management.
 *
 * v1 supports a single territory: The Shops / Pyramid Steps.
 * Claiming grants gameplay benefits: safe sleep, food proximity, shelter.
 */

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
