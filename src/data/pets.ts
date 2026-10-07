/**
 * PixelLab pets: two colony cats (Cat cat, Mittens) and Ella the long-haired
 * dachshund. Sheets in public/assets/sprites/pets/<key>.png are packed by
 * scripts/build-pixellab-extras.py (provenance in scripts/pixellab-extras.json):
 * 92x92 cells, 8 columns, 9 rows —
 *   rows 0-3 walk S/E/N/W (8 frames) · row 4 run E · row 5 run W
 *   row 6 sit/idle S/E/N/W (cols 0-3) + idle loop south (cols 4-7)
 *   row 7 lie down to sleep (8 frames, play once and hold) · row 8 stand S/E/N/W.
 */
import type { CardinalDirection } from "../sprites/BaseNPC";

export const PET_FRAME = 92;
export const PET_COLS = 8;

export const PETS = {
  // displayed at about Mamma Cat's size (she is ~19 px nose to tail)
  catcat: { texture: "pet_catcat", scale: 0.38 },
  mittens: { texture: "pet_mittens", scale: 0.38 },
  ella: { texture: "pet_ella", scale: 0.42 },
} as const;
export type PetKey = keyof typeof PETS;

const ROW_OF: Record<CardinalDirection, number> = { down: 0, right: 1, up: 2, left: 3 };
const SIT_COL: Record<CardinalDirection, number> = { down: 0, right: 1, up: 2, left: 3 };
const range = (start: number, n: number) => Array.from({ length: n }, (_, i) => start + i);

export interface PetAnim {
  key: string;
  frames: number[];
  frameRate: number;
  repeat: number;
}

/**
 * Animation table for a pet sheet, keyed the way NPCCat / DogNPC already ask
 * for them: `<prefix>-walk-<dir>`, `<prefix>-run-<dir>`, `<prefix>-sit-<dir>`,
 * plus `<prefix>-walk`, `<prefix>-run`, `<prefix>-rest`, `<prefix>-idle`.
 */
export function petAnims(prefix: string): PetAnim[] {
  const dirs: CardinalDirection[] = ["down", "right", "up", "left"];
  return [
    ...dirs.map((d) => ({ key: `${prefix}-walk-${d}`, frames: range(ROW_OF[d] * PET_COLS, 8), frameRate: 8, repeat: -1 })),
    { key: `${prefix}-run-right`, frames: range(4 * PET_COLS, 8), frameRate: 12, repeat: -1 },
    { key: `${prefix}-run-left`, frames: range(5 * PET_COLS, 8), frameRate: 12, repeat: -1 },
    // no north/south run art: the walk, faster
    { key: `${prefix}-run-down`, frames: range(0, 8), frameRate: 14, repeat: -1 },
    { key: `${prefix}-run-up`, frames: range(2 * PET_COLS, 8), frameRate: 14, repeat: -1 },
    { key: `${prefix}-walk`, frames: range(PET_COLS, 8), frameRate: 8, repeat: -1 },
    { key: `${prefix}-run`, frames: range(4 * PET_COLS, 8), frameRate: 12, repeat: -1 },
    // sitting: the south one breathes (idle loop), the others hold a pose
    { key: `${prefix}-sit-down`, frames: range(6 * PET_COLS + 4, 4), frameRate: 3, repeat: -1 },
    ...(["right", "up", "left"] as const).map((d) => ({ key: `${prefix}-sit-${d}`, frames: [6 * PET_COLS + SIT_COL[d]], frameRate: 1, repeat: -1 })),
    { key: `${prefix}-idle`, frames: range(6 * PET_COLS + 4, 4), frameRate: 3, repeat: -1 },
    { key: `${prefix}-rest`, frames: range(7 * PET_COLS, 8), frameRate: 5, repeat: 0 },
  ];
}

/** Arcade body in frame pixels for a pet drawn at `scale`: an 18x18 world box at the feet (feet row ~76). */
export function petBody(scale: number): { w: number; h: number; offsetX: number; offsetY: number } {
  const size = Math.round(18 / scale);
  return { w: size, h: size, offsetX: Math.round((PET_FRAME - size) / 2), offsetY: 76 - size };
}
