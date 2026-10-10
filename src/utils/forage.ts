/**
 * Pure forage logic (no Phaser): what each in-game day hides where, decided from a run seed so a
 * reload can't re-roll it. {@link ForageSystem} places and draws the tells.
 */
import type { TimeOfDay } from "../systems/DayNightCycle";

/** `market`: the Paseo de Roxas Sunday market aisle (dawn through evening, never in the daily slots). */
export type Habitat = "shrub" | "shade" | "table" | "lamp" | "lawn" | "market";
export type Tier = "common" | "uncommon" | "rare";

export interface ForageItem {
  id: string;
  name: string;
  emoji: string;
  tier: Tier;
  habitats: Habitat[];
  phases: TimeOfDay[];
  hunger?: number;
  energy?: number;
  thirst?: number;
  /** She sniffs it and backs away: never eaten, never restores anything. */
  hazard?: boolean;
  /** Dug up, not pawed: a keepsake for the Journal's treasure box. */
  treasure?: boolean;
  /** Her own reaction, shown when she finds it. */
  verdict: string;
  /** The Journal's real-world line (cat welfare). */
  realCats?: string;
  /** Relative odds within its tier (default 3): duds and hazards turn up less than food. */
  weight?: number;
}

const ANY: TimeOfDay[] = ["dawn", "day", "evening", "night"];
const LIGHT: TimeOfDay[] = ["dawn", "day", "evening"];
const DARK: TimeOfDay[] = ["evening", "night"];

export const FORAGE_ITEMS: readonly ForageItem[] = [
  // common
  { id: "beetle", name: "Beetle", emoji: "🪲", tier: "common", habitats: ["shrub", "shade"], phases: ANY, hunger: 3, verdict: "Crunchy." },
  { id: "cricket", name: "Cricket", emoji: "🦗", tier: "common", habitats: ["lawn"], phases: ["dawn", "evening", "night"], hunger: 3, verdict: "It stopped chirping. Forever." },
  { id: "moth", name: "Moth", emoji: "🦋", tier: "common", habitats: ["lamp"], phases: DARK, hunger: 2, verdict: "Dusty wings. Gone in one bite." },
  { id: "crust", name: "Pandesal crust", emoji: "🍞", tier: "common", habitats: ["table"], phases: ["dawn", "day"], hunger: 3, verdict: "Plain and dropped. Lucky.", realCats: "Feeders ask people never to give cats table scraps: most carry onion, garlic, salt or bones." },
  { id: "leaf", name: "A leaf", emoji: "🍂", tier: "common", habitats: ["shrub", "shade", "lawn"], phases: ANY, verdict: "It was a leaf. You pounced anyway." , weight: 1 },
  { id: "ants", name: "Ants", emoji: "🐜", tier: "common", habitats: ["table", "lamp"], phases: ANY, verdict: "Ants. Many ants. Many, many ants." , weight: 1 },
  { id: "grass", name: "Grass blade", emoji: "🌱", tier: "common", habitats: ["lawn", "shade"], phases: ANY, verdict: "You chew it. You don't know why.", realCats: "Many cats chew grass, and vets still aren't sure why." , weight: 1 },
  { id: "garlic_rice", name: "Garlic rice", emoji: "🍚", tier: "common", habitats: ["table"], phases: ["evening"], hazard: true, verdict: "Sharp. Wrong. No.", realCats: "Onion and garlic damage a cat's red blood cells, even cooked." , weight: 1 },
  // uncommon
  { id: "grasshopper", name: "Grasshopper", emoji: "🦗", tier: "uncommon", habitats: ["lawn"], phases: ["day"], hunger: 5, verdict: "It leapt. You leapt higher." },
  { id: "chicken", name: "Chicken shred", emoji: "🍗", tier: "uncommon", habitats: ["table"], phases: ["day"], hunger: 4, verdict: "Plain chicken! Somebody's lunch, now yours." },
  { id: "cicada", name: "Cicada shell", emoji: "🪶", tier: "uncommon", habitats: ["shade", "shrub"], phases: ANY, verdict: "Empty, crackly, perfect. You bat it around." },
  { id: "bone", name: "Chicken bone", emoji: "🦴", tier: "uncommon", habitats: ["table"], phases: ["evening"], hazard: true, verdict: "Splinters. No.", realCats: "Cooked bones splinter and can tear a cat's throat or gut." },
  { id: "berries", name: "Hedge berries", emoji: "🫐", tier: "uncommon", habitats: ["shrub"], phases: ["day"], hazard: true, verdict: "Bitter. Not for us.", realCats: "The podocarpus hedges in the park are toxic to cats." },
  { id: "mushrooms", name: "Mushroom ring", emoji: "🍄", tier: "uncommon", habitats: ["shade"], phases: ["dawn", "day"], hazard: true, verdict: "Wet earth, and something wrong underneath. No.", realCats: "No wild mushroom is safe for a cat to eat." },
  // rare
  { id: "kibble", name: "Spilled kibble", emoji: "🥣", tier: "rare", habitats: ["table", "lawn"], phases: LIGHT, hunger: 10, verdict: "Kibble! The good stuff!" },
  { id: "silvervine", name: "Silver-vine stick", emoji: "🌿", tier: "rare", habitats: ["lawn"], phases: ["dawn", "day"], energy: 25, verdict: "Silver vine! The world goes sparkly. ZOOMIES.", realCats: "About 8 in 10 cats react to silver vine, more than to catnip." },
  { id: "catnip_mouse", name: "Catnip mouse", emoji: "🐭", tier: "rare", habitats: ["lawn", "table"], phases: LIGHT, energy: 20, verdict: "A catnip mouse! You roll on it. You do not eat it." },
  { id: "lilies", name: "Lily bouquet", emoji: "💐", tier: "rare", habitats: ["table"], phases: ANY, hazard: true, verdict: "Sweet, and wrong. Back away.", realCats: "Lilies can kill a cat, even a little pollen licked off fur." },
  // treasure (dug up)
  { id: "bottle_cap", name: "Bottle cap", emoji: "🔘", tier: "common", habitats: ["shade", "lawn", "shrub"], phases: ANY, treasure: true, verdict: "Shiny! Worthless! Yours!" },
  { id: "jingle_bell", name: "Jingle bell", emoji: "🔔", tier: "uncommon", habitats: ["shade", "lawn", "shrub"], phases: ANY, treasure: true, verdict: "It jingles. Someone's cat wore this once." },
  { id: "old_peso", name: "Old 1-peso coin", emoji: "🪙", tier: "uncommon", habitats: ["shade", "lawn", "shrub"], phases: ANY, treasure: true, verdict: "Rizal, looking serious. Older than you." },
  { id: "earring", name: "Lost earring", emoji: "💎", tier: "rare", habitats: ["shade", "lawn", "shrub"], phases: ANY, treasure: true, verdict: "Sparkly! Somebody looked everywhere for this." },
  // the Sunday market on Paseo de Roxas
  { id: "fish_flake", name: "Steamed fish flake", emoji: "🐟", tier: "common", habitats: ["market"], phases: LIGHT, hunger: 4, verdict: "Plain fish! The vendor didn't see. Or pretended not to." },
  { id: "skewer", name: "Fishball skewer", emoji: "🍢", tier: "common", habitats: ["market"], phases: LIGHT, hazard: true, verdict: "Sharp stick. Sweet sauce. No.", realCats: "Cats swallow skewers for the meat smell on them; vets remove them every week." },
  { id: "ribbon", name: "Balloon ribbon", emoji: "🎈", tier: "uncommon", habitats: ["market"], phases: LIGHT, hazard: true, verdict: "Curly, tempting, wrong. Leave it.", realCats: "Swallowed string or ribbon can bunch up a cat's gut. It's an emergency." },
  { id: "charm", name: "Bracelet charm", emoji: "🧿", tier: "rare", habitats: ["market"], phases: LIGHT, treasure: true, verdict: "A tiny charm, dropped from somebody's bracelet. Lucky!" },
  { id: "fish_keychain", name: "Golden fish keychain", emoji: "🐟", tier: "rare", habitats: ["shade", "lawn", "shrub"], phases: ANY, treasure: true, verdict: "A golden fish! Not edible. Still the best day ever." },
];

export const ITEM_BY_ID: ReadonlyMap<string, ForageItem> = new Map(FORAGE_ITEMS.map((i) => [i.id, i]));

/** Each day's slots: where the tell hides, and whether she has to dig for it. */
const slots = (habitat: Habitat, n: number, buried = 0) =>
  Array.from({ length: n }, (_, i) => ({ habitat, buried: i < buried }));
/** Slot 0 is the doorstep tell (placed near her), so it must be a habitat with a beetle (the first-ever find). */
export const DAY_SLOTS: ReadonlyArray<{ habitat: Habitat; buried: boolean }> = [
  ...slots("shrub", 4),
  ...slots("shade", 6, 2),
  ...slots("table", 5),
  ...slots("lamp", 3),
  ...slots("lawn", 6, 2),
].sort((a, b) => Number(a.buried) - Number(b.buried));

/** Per-slot odds; with 24 slots that is a rare on about 45% of days before the pity rule. */
export const TIER_ODDS = { rare: 0.025, uncommon: 0.15 };
/** A run never goes this many in-game days without a rare somewhere. */
export const RARE_PITY_DAYS = 3;
/** Forage tops up at most about half a day's food (Manu's call). */
export const FORAGE_HUNGER_DAILY_CAP = 20;

export interface DayTell {
  index: number;
  habitat: Habitat;
  buried: boolean;
  itemId: string;
  /** Seeded 0..1 used to pick a cell in the habitat. */
  spot: number;
}

/** mulberry32: small, fast, good enough for game dice. */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function mixSeed(...parts: number[]): number {
  let h = 2166136261;
  for (const p of parts) {
    h ^= p >>> 0;
    h = Math.imul(h, 16777619);
    h ^= h >>> 13;
  }
  return h >>> 0;
}

function pool(slotIndex: number, tier: Tier): ForageItem[] {
  const slot = DAY_SLOTS[slotIndex];
  if (!slot) return [];
  const buried = Boolean(slot.buried);
  return FORAGE_ITEMS.filter((i) => i.tier === tier && Boolean(i.treasure) === buried && i.habitats.includes(slot.habitat));
}

/** A slot whose habitat has nothing of that tier (no rare moths) drops a tier. */
function hostable(slotIndex: number, tier: Tier): Tier {
  if (tier === "rare" && pool(slotIndex, "rare").length === 0) tier = "uncommon";
  if (tier === "uncommon" && pool(slotIndex, "uncommon").length === 0) tier = "common";
  return tier;
}

const RARE_SLOTS = DAY_SLOTS.map((_, i) => i).filter((i) => pool(i, "rare").length > 0);

function naturalTiers(seed: number, day: number): Tier[] {
  const rng = seededRng(mixSeed(seed, day, 1));
  return DAY_SLOTS.map((_, i) => {
    const r = rng();
    return hostable(i, r < TIER_ODDS.rare ? "rare" : r < TIER_ODDS.rare + TIER_ODDS.uncommon ? "uncommon" : "common");
  });
}

/** Tiers for `day`, at most one rare a day, and never {@link RARE_PITY_DAYS} days running without one. Pure in (seed, day). */
export function dayTiers(seed: number, day: number): Tier[] {
  let sinceRare = 0;
  let tiers: Tier[] = [];
  for (let d = 1; d <= day; d++) {
    tiers = naturalTiers(seed, d);
    const firstRare = tiers.indexOf("rare");
    tiers = tiers.map((t, i) => (t === "rare" && i !== firstRare ? hostable(i, "uncommon") : t));
    if (firstRare < 0 && sinceRare >= RARE_PITY_DAYS - 1) {
      const slot = RARE_SLOTS[Math.floor(seededRng(mixSeed(seed, d, 2))() * RARE_SLOTS.length)];
      if (slot !== undefined) tiers[slot] = "rare";
    }
    sinceRare = tiers.includes("rare") ? 0 : sinceRare + 1;
  }
  return tiers;
}

/** The day's tells: which item hides in each slot. Same (seed, day) → same tells, whatever happened in between. */
export function rollDay(seed: number, day: number): DayTell[] {
  const tiers = dayTiers(seed, day);
  const rng = seededRng(mixSeed(seed, day, 3));
  return DAY_SLOTS.map((slot, index) => {
    const options = pool(index, tiers[index] ?? "common");
    let roll = rng() * options.reduce((sum, i) => sum + (i.weight ?? 3), 0);
    const pick = options.find((i) => (roll -= i.weight ?? 3) < 0) ?? options[0] ?? FORAGE_ITEMS[0]!;
    return { index, habitat: slot.habitat, buried: Boolean(slot.buried), itemId: pick.id, spot: rng() };
  });
}

/** How much of `wanted` hunger forage may still give today. */
export function forageHungerAllowed(hungerToday: number, wanted: number): number {
  return Math.max(0, Math.min(wanted, FORAGE_HUNGER_DAILY_CAP - hungerToday));
}

/** Sunday market tells, seeded per day: where in the aisle (0..1) and what. */
export function rollMarket(seed: number, day: number, count: number): Array<{ itemId: string; spot: number }> {
  const items = FORAGE_ITEMS.filter((i) => i.habitats.includes("market"));
  const odds: Record<Tier, number> = { common: 6, uncommon: 2, rare: 0.6 };
  const total = items.reduce((sum, i) => sum + odds[i.tier], 0);
  const rng = seededRng(mixSeed(seed, day, 99));
  return Array.from({ length: count }, () => {
    let roll = rng() * total;
    const pick = items.find((i) => (roll -= odds[i.tier]) < 0) ?? items[0]!;
    return { itemId: pick.id, spot: rng() };
  });
}

export const TIER_POINTS: Record<Tier, number> = { common: 10, uncommon: 30, rare: 100 };
