import { PETS } from "../data/pets";
import type { NPCCatConfig } from "../sprites/NPCCat";
/**
 * Pure helpers for the dynamic colony-count model.
 *
 * `COLONY_COUNT` in the Phaser registry represents the *total* cat
 * population of the colony (named cats + Mamma Cat + unseen background),
 * not just the visible background roster. Visible "Colony Cat N" entities
 * are a bounded sample of the total. Keeping these helpers Phaser-free so
 * they can be exercised with plain unit tests.
 */

/**
 * Compute how many background "Colony Cat N" entities `GameScene.spawnColonyCats`
 * should instantiate given the current narrative total and the cap.
 *
 *   visible = clamp(total - namedAndMamma, 0, cap)
 *
 * - `total - namedAndMamma` is the count of "available" background cats
 *   (unseen + visible combined).
 * - The floor of 0 guards against weird saves / over-decrements.
 * - The cap is a perf/readability ceiling — on a healthy colony the
 *   visible count is just the cap, regardless of how many unseen cats
 *   exist. Once snatching thins the total enough that the cap no longer
 *   binds (total < namedAndMamma + cap), the visible roster shrinks.
 */
export function computeBackgroundSpawnCount(
  total: number,
  namedAndMamma: number,
  cap: number,
): number {
  if (!Number.isFinite(total) || !Number.isFinite(namedAndMamma) || !Number.isFinite(cap)) {
    return 0;
  }
  if (cap <= 0) return 0;
  const available = Math.floor(total) - Math.floor(namedAndMamma);
  if (available <= 0) return 0;
  return Math.min(available, Math.floor(cap));
}

/**
 * Apply a snatcher-driven decrement to the colony total, clamped so the
 * counter never falls below the named+Mamma floor. Returns the new total.
 * Pure — caller is responsible for writing the result back to the registry.
 */
export function decrementColonyTotal(current: number, floor: number): number {
  const safeCurrent = Number.isFinite(current) ? Math.floor(current) : floor;
  const safeFloor = Number.isFinite(floor) ? Math.floor(floor) : 0;
  return Math.max(safeFloor, safeCurrent - 1);
}

const LEGACY_CAT_SHEETS = ["mammacat", "blacky", "tiger", "jayco", "fluffy"];

/**
 * Look for background colony cat number `index`. The first two are Cat cat and
 * Mittens (PixelLab, 4-direction walks) — one of each, they are individuals;
 * everyone else uses the legacy sheets. Fixed per index, so a cat Mamma Cat has
 * learned the name of looks the same every session.
 */
export function backgroundCatLook(index: number): Pick<NPCCatConfig, "spriteKey" | "scale" | "layout"> {
  const street = STREET_COLONY[index - STREET_COLONY_BASE];
  if (street) return { spriteKey: street.spriteKey };
  const pet = index === 0 ? PETS.catcat : index === 1 ? PETS.mittens : null;
  if (pet) return { spriteKey: pet.texture, scale: pet.scale, layout: "pixellab" };
  return { spriteKey: LEGACY_CAT_SHEETS[index % LEGACY_CAT_SHEETS.length] ?? "blacky" };
}

/** What the colony calls its background cats, by index (the first two are the PixelLab pets). */
const COLONY_CAT_NAMES = [
  "Cat cat", "Mittens", "Muning", "Mingming", "Tagpi", "Kuting", "Ganda", "Pogi",
  "Bunso", "Tisoy", "Kape", "Ube", "Mochi", "Puti", "Itim", "Pandesal",
  "Siopao", "Bituin", "Sungit", "Taba", "Kulot", "Bulak", "Dilaw", "Kidlat",
  "Choco", "Mais", "Bibingka", "Sinigang", "Lambing", "Tala", "Ulan", "Kisig",
];

/**
 * The street colony on the city side of Ayala Ave, by the underpass: three cats
 * the office guards look after, on reserved indices far above the park roster
 * (whose indices grow one by one with newcomers), so neither ever renumbers the other.
 */
export const STREET_COLONY_BASE = 1000;
export const STREET_COLONY = [
  // Simba: golden, fluffy, king of the rock in the middle of the walkway
  { name: "Simba", spriteKey: "fluffy", tint: 0xf0a848 },
  { name: "Bantay", spriteKey: "blacky", tint: 0x3a3a3a },
  { name: "Pandan", spriteKey: "tiger", tint: 0xb4ab9c },
] as const;
export const isStreetColonyIndex = (index: number): boolean => index >= STREET_COLONY_BASE && index < STREET_COLONY_BASE + STREET_COLONY.length;

/** Background colony cat `index`'s name: fixed per index, numbered once the list runs out. */
export function colonyCatName(index: number): string {
  const street = STREET_COLONY[index - STREET_COLONY_BASE];
  if (street) return street.name;
  const base = COLONY_CAT_NAMES[index % COLONY_CAT_NAMES.length] ?? "Mingming";
  const round = Math.floor(index / COLONY_CAT_NAMES.length);
  return round === 0 ? base : `${base} ${round + 1}`;
}

/** The first `count` background indices, skipping cats lost to snatchers (they never come back). */
export function backgroundIndices(count: number, lost: ReadonlySet<number>): number[] {
  const out: number[] = [];
  for (let i = 0; out.length < count; i++) if (!lost.has(i)) out.push(i);
  return out;
}

/** A saved list of background indices (registry values may be missing or corrupt). */
export function readIndexList(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((v): v is number => Number.isInteger(v) && v >= 0) : [];
}
