import { describe, expect, it } from "vitest";
import {
  DAY_SLOTS,
  FORAGE_HUNGER_DAILY_CAP,
  FORAGE_ITEMS,
  ITEM_BY_ID,
  RARE_PITY_DAYS,
  dayTiers,
  forageHungerAllowed,
  rollDay,
} from "../../src/utils/forage";

describe("forage day roll", () => {
  it("is deterministic in (seed, day)", () => {
    expect(rollDay(1234, 7)).toEqual(rollDay(1234, 7));
    expect(rollDay(1234, 7)).not.toEqual(rollDay(1235, 7));
  });

  it("puts every item where its habitat and dig-ness allow", () => {
    for (let seed = 1; seed <= 50; seed++)
      for (let day = 1; day <= 20; day++)
        for (const t of rollDay(seed, day)) {
          const item = ITEM_BY_ID.get(t.itemId)!;
          expect(item.habitats).toContain(t.habitat);
          expect(Boolean(item.treasure)).toBe(t.buried);
          expect(t.habitat).toBe(DAY_SLOTS[t.index]!.habitat);
        }
  });

  it("gives at most one rare a day and never goes RARE_PITY_DAYS days without one", () => {
    for (let seed = 1; seed <= 200; seed++) {
      let dry = 0;
      for (let day = 1; day <= 30; day++) {
        const rares = dayTiers(seed, day).filter((t) => t === "rare").length;
        expect(rares).toBeLessThanOrEqual(1);
        dry = rares ? 0 : dry + 1;
        expect(dry).toBeLessThan(RARE_PITY_DAYS);
      }
    }
  });

  it("rolled rares really are rare items", () => {
    for (let seed = 1; seed <= 100; seed++)
      for (let day = 1; day <= 10; day++) {
        const tiers = dayTiers(seed, day);
        for (const t of rollDay(seed, day)) expect(ITEM_BY_ID.get(t.itemId)!.tier).toBe(tiers[t.index]);
      }
  });

  it("hazards never feed her", () => {
    for (const item of FORAGE_ITEMS.filter((i) => i.hazard)) {
      expect(item.hunger ?? 0).toBe(0);
      expect(item.energy ?? 0).toBe(0);
      expect(item.realCats).toBeTruthy();
    }
  });
});

describe("forage hunger cap", () => {
  it("tops up at most FORAGE_HUNGER_DAILY_CAP a day", () => {
    let today = 0;
    for (let i = 0; i < 20; i++) today += forageHungerAllowed(today, 4);
    expect(today).toBe(FORAGE_HUNGER_DAILY_CAP);
    expect(forageHungerAllowed(FORAGE_HUNGER_DAILY_CAP, 10)).toBe(0);
    expect(forageHungerAllowed(18, 10)).toBe(2);
  });
});
