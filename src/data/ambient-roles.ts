/**
 * Ambient park crowd: who is in Ayala Triangle Gardens, when, doing what.
 * Pure data read by AmbientCrowdSystem. Tune head-counts in `population`
 * (live people per time slot) or globally with CROWD_TUNING.densityScale.
 *
 * Appearance is restricted to ANONYMOUS art only (see CROWD_LOOKS); never the
 * named feeder/Ben/Camille/Manu/Kish sheets or the snatchers.
 */

import type { CardinalDirection } from "../sprites/BaseNPC";
import type { CrowdSlot } from "../utils/crowdSchedule";

export type Facing = "S" | "E" | "N" | "W";
/**
 * Anonymous park people drawn with PixelLab in the same style as Camille and
 * Manu (scripts/pixellab-crowd.json; sheets packed by scripts/build-crowd-sheets.py
 * into public/assets/sprites/crowd/<key>.png: 68x68 cells, 8 cols x 6 rows; rows 0-3 walk
 * S/E/N/W, row 4 = stand S/E/N/W + selfie + smoke, row 5 = sit_bench S/E/N/W + sit_ground S/E/N/W).
 * `poses` lists the pose cells that exist; missing ones fall back to the
 * cropped-standing fake.
 */
export const PIXEL_CROWD = {
  officeMan: { poses: ["sit_bench", "smoke"] },
  officeWoman: { poses: ["sit_bench", "sit_ground"] },
  student: { poses: ["sit_bench", "sit_ground"] },
  barongMan: { poses: ["sit_bench", "smoke"] },
  tourist: { poses: ["sit_bench", "sit_ground", "selfie"] },
  teen: { poses: ["sit_bench", "sit_ground", "selfie"] },
  lola: { poses: ["sit_bench", "sit_ground"] },
  youngPro: { poses: ["sit_bench", "sit_ground", "selfie"] },
  dad: { poses: ["sit_bench", "sit_ground", "smoke"] },
  parkStaff: { poses: ["sit_bench", "smoke"] },
  rider: { poses: ["sit_bench", "sit_ground"] },
  expat: { poses: ["sit_bench"] },
} as const satisfies Record<string, { poses: readonly ("sit_bench" | "sit_ground" | "selfie" | "smoke")[] }>;
export type PixelLookId = keyof typeof PIXEL_CROWD;
export const pixelCrowdTexture = (key: PixelLookId): string => `crowd_${key}`;

export type CrowdLookId = "walkerF" | "joggerF" | "joggerM" | "pinkGirl" | "fedoraMan" | PixelLookId;
export type AnchorType = "bench" | "dining" | "picnic" | "smoking" | "selfie";
/** seated / groundSit are faked for most looks (cropped standing frame) — see CROWD_LOOKS. */
export type CrowdPose = "seated" | "groundSit" | "stand" | "selfie";
export type CrowdProp = "none" | "food" | "cup" | "cigarette" | "phone";
type Frame = readonly [texture: string, frame: number];

export interface CrowdLook {
  /** Static frame per facing. Side-view looks repeat their right-facing frame and flip for west. */
  face: Readonly<Record<Facing, Frame>>;
  walk?: Readonly<Record<CardinalDirection, string>>;
  run?: Readonly<Record<CardinalDirection, string>>;
  /** Art only exists facing right (flipX for left; no north/south art). */
  sideView: boolean;
  scale: number;
  originX: number;
  /** Feet line as a fraction of frame height, so (x, y) is where the person stands. */
  originY: number;
  frameW: number;
  frameH: number;
  /** Seated fake: keep frame rows [0, seatCropY) and sink the sprite so the cut lands on the seat. */
  seatCropY: number;
  /** Real sitting frames: legs out (bench/table) and knees hugged (grass). One frame (pinkGirl)… */
  sitFrame?: Frame;
  groundSitFrame?: Frame;
  /** …or one per facing (PixelLab people). */
  sitFrames?: Readonly<Record<Facing, Frame>>;
  groundSitFrames?: Readonly<Record<Facing, Frame>>;
  /** Static poses (PixelLab people): phone held up for a selfie; cigarette at the lips. */
  selfieFrame?: Frame;
  smokeFrame?: Frame;
  /** Optional looping idle while standing (pinkGirl only; other stand sheets are frozen facings). */
  idleAnim?: string;
  /** Optional pose anims (pinkGirl only). */
  phoneWalkAnim?: string;
  selfieAnim?: string;
}

const dirs = (prefix: string): Record<CardinalDirection, string> => ({
  down: `${prefix}-down`,
  left: `${prefix}-left`,
  right: `${prefix}-right`,
  up: `${prefix}-up`,
});
const same = (key: string): Record<CardinalDirection, string> => ({ down: key, left: key, right: key, up: key });

/**
 * Anonymous looks. Frame layouts were checked against the PNGs:
 * - walkerF: the female dog walker's 4-direction walk strips (48x48, figure ~29 px, no stand sheet → walk frame 0).
 * - joggerF / joggerM: run strips + 8-facing stand sheets (col 0 S, 2 E, 4 N, 6 W). They only RUN.
 * - pinkGirl: girl.png 8x6 grid of 150x85, side view facing right. Row 0 idle, 1 walk, 2 walk→raise phone,
 *   3 phone walk (6), 4 run, 5 sit/lie. Pink hair: copies read as clones.
 * - fedoraMan: legacy dogwalker.png, really 14x3 figures of 25x45, side view facing right. Row 1 cols 0-7 is
 *   an 8-frame walk (rows 0/2 hold a small grey object — avoided), row 2 cols 8-13 a run.
 */
/** Pose cells in a PixelLab crowd sheet (8 columns): stand S/E/N/W 32-35, selfie 36, smoke 37, sit 40-43, ground-sit 44-47. */
const PIXEL_CELL = { stand: 32, selfie: 36, smoke: 37, sitBench: 40, sitGround: 44 } as const;
const fourFacings = (tex: string, first: number): Record<Facing, Frame> => ({ S: [tex, first], E: [tex, first + 1], N: [tex, first + 2], W: [tex, first + 3] });
function pixelLook(key: PixelLookId): CrowdLook {
  const tex = pixelCrowdTexture(key);
  const poses: readonly string[] = PIXEL_CROWD[key].poses;
  return {
    face: fourFacings(tex, PIXEL_CELL.stand),
    walk: dirs(`crowd-${key}-walk`),
    sideView: false,
    scale: 0.7, // same size as Camille / Manu
    originX: 0.5,
    originY: 59 / 68, // feet row of the PixelLab rotations
    frameW: 68,
    frameH: 68,
    seatCropY: 44,
    ...(poses.includes("sit_bench") ? { sitFrames: fourFacings(tex, PIXEL_CELL.sitBench) } : {}),
    ...(poses.includes("sit_ground") ? { groundSitFrames: fourFacings(tex, PIXEL_CELL.sitGround) } : {}),
    ...(poses.includes("selfie") ? { selfieFrame: [tex, PIXEL_CELL.selfie] as Frame } : {}),
    ...(poses.includes("smoke") ? { smokeFrame: [tex, PIXEL_CELL.smoke] as Frame } : {}),
  };
}
const pixelLooks = Object.fromEntries((Object.keys(PIXEL_CROWD) as PixelLookId[]).map((k) => [k, pixelLook(k)])) as Record<PixelLookId, CrowdLook>;

export const CROWD_LOOKS: Readonly<Record<CrowdLookId, CrowdLook>> = {
  ...pixelLooks,
  walkerF: {
    face: { S: ["dw_s", 0], E: ["dw_e", 0], N: ["dw_n", 0], W: ["dw_w", 0] },
    walk: dirs("dogwalker-walk"),
    sideView: false,
    scale: 1.15,
    originX: 0.5,
    originY: 40 / 48,
    frameW: 48,
    frameH: 48,
    seatCropY: 27,
  },
  joggerF: {
    face: { S: ["jogger_stand", 0], E: ["jogger_stand", 2], N: ["jogger_stand", 4], W: ["jogger_stand", 6] },
    run: dirs("jogger-walk"),
    sideView: false,
    scale: 0.7,
    originX: 0.5,
    originY: 60 / 68,
    frameW: 68,
    frameH: 68,
    seatCropY: 40,
  },
  joggerM: {
    face: { S: ["mjog_stand", 0], E: ["mjog_stand", 2], N: ["mjog_stand", 4], W: ["mjog_stand", 6] },
    run: dirs("jogger_male-walk"),
    sideView: false,
    scale: 1,
    originX: 0.5,
    originY: 43 / 48,
    frameW: 48,
    frameH: 48,
    seatCropY: 29,
  },
  pinkGirl: {
    face: { S: ["crowd_girl", 0], E: ["crowd_girl", 0], N: ["crowd_girl", 0], W: ["crowd_girl", 0] },
    walk: same("crowd-girl-walk"),
    run: same("crowd-girl-run"),
    sideView: true,
    scale: 0.66,
    originX: 0.48,
    originY: 80 / 85,
    frameW: 150,
    frameH: 85,
    seatCropY: 62,
    sitFrame: ["crowd_girl", 41],
    groundSitFrame: ["crowd_girl", 40],
    idleAnim: "crowd-girl-idle",
    phoneWalkAnim: "crowd-girl-phonewalk",
    selfieAnim: "crowd-girl-selfie",
  },
  fedoraMan: {
    face: { S: ["crowd_fedora", 16], E: ["crowd_fedora", 16], N: ["crowd_fedora", 16], W: ["crowd_fedora", 16] },
    walk: same("crowd-fedora-walk"),
    run: same("crowd-fedora-run"),
    sideView: true,
    scale: 0.8,
    originX: 0.52,
    originY: 1,
    frameW: 25,
    frameH: 45,
    seatCropY: 28,
  },
};

/** Textures crowd looks may use (BootScene keys). Anything else is a bug. */
export const CROWD_TEXTURES: readonly string[] = [
  "dw_s",
  "dw_e",
  "dw_n",
  "dw_w",
  "jogger_stand",
  "mjog_stand",
  "crowd_girl",
  "crowd_fedora",
  ...(Object.keys(PIXEL_CROWD) as PixelLookId[]).map(pixelCrowdTexture),
];

/** Anims the crowd system registers itself (dogwalker/jogger anims come from SpriteProfiles). */
export const CROWD_ANIMS: ReadonlyArray<{
  key: string;
  texture: string;
  frames: readonly number[];
  frameRate: number;
  repeat: number;
}> = [
  { key: "crowd-girl-idle", texture: "crowd_girl", frames: [0, 1, 2, 3, 4, 5, 6, 7], frameRate: 4, repeat: -1 },
  { key: "crowd-girl-walk", texture: "crowd_girl", frames: [8, 9, 10, 11, 12, 13, 14, 15], frameRate: 8, repeat: -1 },
  { key: "crowd-girl-selfie", texture: "crowd_girl", frames: [20, 21, 22, 23], frameRate: 5, repeat: 0 },
  { key: "crowd-girl-phonewalk", texture: "crowd_girl", frames: [24, 25, 26, 27, 28, 29], frameRate: 7, repeat: -1 },
  { key: "crowd-girl-run", texture: "crowd_girl", frames: [32, 33, 34, 35, 36, 37, 38, 39], frameRate: 10, repeat: -1 },
  { key: "crowd-fedora-walk", texture: "crowd_fedora", frames: [14, 15, 16, 17, 18, 19, 20, 21], frameRate: 8, repeat: -1 },
  { key: "crowd-fedora-run", texture: "crowd_fedora", frames: [36, 37, 38, 39, 40, 41], frameRate: 10, repeat: -1 },
  ...(Object.keys(PIXEL_CROWD) as PixelLookId[]).flatMap((k) => [
    ...(["down", "right", "up", "left"] as const).map((dir, row) => ({
      key: `crowd-${k}-walk-${dir}`,
      texture: pixelCrowdTexture(k),
      frames: [0, 1, 2, 3, 4, 5, 6, 7].map((f) => row * 8 + f),
      frameRate: 8,
      repeat: -1,
    })),
  ]),
];

export interface CrowdRole {
  id: string;
  looks: readonly CrowdLookId[];
  gait: "walk" | "run";
  /** px/s (Mamma Cat walks at 80). */
  speed: readonly [number, number];
  /** stroll: wander walkway hubs then leave. anchored: walk to an anchor, dwell, leave. */
  motion: "stroll" | "anchored";
  anchor?: AnchorType;
  pose?: CrowdPose;
  dwellMs?: readonly [number, number];
  /** Chance to pick an anchor someone already uses (bench pairs, tables, picnic groups). */
  joinChance?: number;
  /** stroll: number of walkway hubs visited before leaving. */
  stops?: readonly [number, number];
  /** stroll: looking at a phone while walking. */
  phoneWalk?: boolean;
  prop: CrowdProp;
  /** Live head-count per slot (before CROWD_TUNING.densityScale). */
  population: Readonly<Record<CrowdSlot, number>>;
}

//                                     dawn  day  lunch  evening  night
const pop = (dawn: number, day: number, lunch: number, evening: number, night: number) => ({
  dawn,
  day,
  lunch,
  evening,
  night,
});

export const CROWD_ROLES: readonly CrowdRole[] = [
  { id: "stroller", looks: ["officeWoman", "lola", "tourist", "barongMan", "student", "youngPro", "dad", "expat", "walkerF"], gait: "walk", speed: [36, 48], motion: "stroll", stops: [2, 4], prop: "none", population: pop(3, 8, 6, 6, 2) },
  { id: "office_worker", looks: ["officeMan", "officeWoman", "barongMan", "youngPro", "expat"], gait: "walk", speed: [50, 60], motion: "stroll", stops: [1, 2], prop: "none", population: pop(1, 6, 8, 5, 0) },
  { id: "phone_walker", looks: ["teen", "student", "youngPro"], gait: "walk", speed: [28, 38], motion: "stroll", stops: [1, 3], phoneWalk: true, prop: "phone", population: pop(0, 3, 3, 2, 0) },
  { id: "jogger", looks: ["joggerF", "joggerM"], gait: "run", speed: [85, 110], motion: "stroll", stops: [3, 5], prop: "none", population: pop(4, 1, 0, 5, 1) },
  { id: "jogger_break", looks: ["joggerF", "joggerM"], gait: "run", speed: [85, 100], motion: "anchored", anchor: "bench", pose: "stand", dwellMs: [15_000, 40_000], joinChance: 0.2, prop: "none", population: pop(1, 0, 0, 1, 0) },
  { id: "tourist", looks: ["tourist", "teen", "youngPro"], gait: "walk", speed: [30, 42], motion: "anchored", anchor: "selfie", pose: "selfie", dwellMs: [12_000, 30_000], joinChance: 0.4, prop: "phone", population: pop(0, 5, 3, 3, 0) },
  { id: "bench_sitter", looks: ["lola", "officeMan", "barongMan", "student", "youngPro", "dad", "expat", "rider"], gait: "walk", speed: [32, 44], motion: "anchored", anchor: "bench", pose: "seated", dwellMs: [40_000, 120_000], joinChance: 0.6, prop: "none", population: pop(0, 6, 8, 6, 0) },
  { id: "lunch_eater", looks: ["officeMan", "officeWoman", "barongMan", "expat", "parkStaff", "rider"], gait: "walk", speed: [40, 52], motion: "anchored", anchor: "bench", pose: "seated", dwellMs: [45_000, 110_000], joinChance: 0.4, prop: "food", population: pop(0, 1, 8, 0, 0) },
  { id: "diner", looks: ["officeWoman", "officeMan", "tourist", "barongMan", "teen", "youngPro", "expat", "dad"], gait: "walk", speed: [34, 46], motion: "anchored", anchor: "dining", pose: "seated", dwellMs: [50_000, 140_000], joinChance: 0.65, prop: "cup", population: pop(0, 4, 10, 8, 0) },
  { id: "picnicker", looks: ["student", "teen", "tourist", "youngPro", "lola", "officeWoman", "dad", "rider"], gait: "walk", speed: [32, 44], motion: "anchored", anchor: "picnic", pose: "groundSit", dwellMs: [60_000, 160_000], joinChance: 0.7, prop: "food", population: pop(0, 5, 8, 2, 0) },
  { id: "smoker", looks: ["officeMan", "barongMan", "dad", "parkStaff"], gait: "walk", speed: [34, 46], motion: "anchored", anchor: "smoking", pose: "stand", dwellMs: [25_000, 70_000], joinChance: 0.6, prop: "cigarette", population: pop(1, 3, 3, 3, 1) },
  // park maintenance staff doing the rounds, slowly, with many stops
  { id: "groundskeeper", looks: ["parkStaff"], gait: "walk", speed: [26, 34], motion: "stroll", stops: [4, 7], prop: "none", population: pop(2, 2, 1, 2, 0) },
  // food-delivery riders cutting through the park to the restaurant row and the towers
  { id: "delivery_rider", looks: ["rider"], gait: "walk", speed: [62, 74], motion: "stroll", stops: [1, 2], prop: "none", population: pop(0, 1, 2, 2, 0) },
];

/** Seat offsets (px from the anchor point) and the facing used when the anchor is shared. Alone → face S. */
export const ANCHOR_SEATS: Readonly<Record<AnchorType, ReadonlyArray<{ dx: number; dy: number; face: Facing }>>> = {
  bench: [
    { dx: -7, dy: -1, face: "E" },
    { dx: 7, dy: -1, face: "W" },
  ],
  dining: [
    { dx: -13, dy: 2, face: "E" },
    { dx: 13, dy: 2, face: "W" },
  ],
  picnic: [
    { dx: -10, dy: 0, face: "E" },
    { dx: 10, dy: 0, face: "W" },
    { dx: 0, dy: 8, face: "N" },
  ],
  smoking: [
    { dx: -14, dy: 0, face: "E" },
    { dx: 14, dy: 2, face: "W" },
    { dx: 0, dy: 12, face: "N" },
  ],
  selfie: [
    { dx: -8, dy: 0, face: "S" },
    { dx: 9, dy: 3, face: "S" },
  ],
};

export const CROWD_TUNING = {
  /** Multiplies every role's population. */
  densityScale: 1,
  /** Sprite pool; a little above the busiest slot so leavers can finish walking out. */
  poolSize: 72,
  /**
   * People spawn hidden, within this many px of the camera centre, so the
   * density follows the player around a park ~9000 px wide (at zoom 2.5 the
   * view is only 326x250 px). Smaller = busier screens.
   */
  spawnRadius: 1000,
  /** Hidden people further than this from the camera are recycled. */
  recycleRadius: 1600,
  /** Stroll hubs are picked within this radius of the person's start. */
  roamRadius: 900,
  /**
   * Chance an anchored person picks a free anchor within nearRadius of the
   * camera (and a stroller routes its first leg there), so what the player
   * sees is busier than a uniform spread over the spawn bubble.
   */
  nearBias: 0.6,
  nearRadius: 450,
  /** Entry point walking distance to an anchor (px along walkways). */
  entryMin: 160,
  entryMax: 1000,
  /** Chance to enter through a hidden map exit instead of a hidden walkway node. */
  exitEntryChance: 0.5,
  spawnIntervalMs: 150,
  shedIntervalMs: 400,
  /** Hidden surplus people removed per shed tick (visible ones walk out instead). */
  shedPerTick: 4,
  /** Off-graph hops (walkway → bench/table/lawn) longer than this are not used. */
  maxHop: 600,
  /** People glance at Mamma Cat inside this radius. */
  glanceRadius: 48,
  glanceMs: 1500,
  glanceCooldownMs: 7000,
  /**
   * Noticing Mamma Cat: within noticeRadius a person may react once per
   * noticeCooldownMs (heart, curious look, a tourist's camera flash), with
   * the role's chance from NOTICE_CHANCE.
   */
  noticeRadius: 72,
  noticeCooldownMs: 45_000,
  /**
   * Treats: if Mamma Cat lingers by someone eating (picnic, lunch, café table)
   * for treatLingerMs, they may toss her a morsel (treatChance, once per
   * person). It lies on the ground for treatLifeMs; eating it restores
   * treatHunger. At most treatsPerDay per in-game day.
   */
  treatRadius: 56,
  treatLingerMs: 2500,
  treatChance: 0.45,
  treatLifeMs: 25_000,
  treatHunger: 8,
  treatsPerDay: 4,
  /** Extra guards (on top of GameScene's restaurant guard). */
  maxGuards: 10,
  nightGuards: 4,
  guardFriendlyEvery: 3,
  /** The extra hostile guard stays this far from Mamma Cat's spawn and the restaurant guard. */
  hostileMinDist: 600,
  /** ...and this far from shelters, food and water so it never denies a resource. */
  hostileResourceDist: 350,
  /** No extra guard is posted this close to the restaurant guard. */
  guardSpacing: 400,
  hostilePreference: ["guard_restaurant_row_w", "guard_tower_one", "guard_pse_plaza"],
  /** Tints for variety (WebGL only; Canvas renders untinted). */
  tints: [0xffffff, 0xffe6cc, 0xdde8ff, 0xe6ffdd, 0xffdde6, 0xe8e0d0, 0xd8d8d8],
} as const;

/** Chance a person of this role reacts when Mamma Cat comes close (see CROWD_TUNING.noticeRadius). */
export const NOTICE_CHANCE: Readonly<Record<string, number>> = {
  tourist: 0.75,
  picnicker: 0.6,
  lunch_eater: 0.6,
  bench_sitter: 0.5,
  diner: 0.5,
  stroller: 0.25,
  smoker: 0.2,
  phone_walker: 0.1,
  office_worker: 0.1,
  groundskeeper: 0.4,
  delivery_rider: 0.05,
};

/** Roles that have food on them and may share a morsel. */
export const TREAT_ROLES: ReadonlySet<string> = new Set(["picnicker", "lunch_eater", "diner"]);
