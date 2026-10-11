import Phaser from "phaser";
import type { GameScene } from "../scenes/GameScene";
import type { HUDScene } from "../scenes/HUDScene";
import { CROWD_LOOKS, PIXEL_CROWD, type CrowdLookId, type Facing } from "../data/ambient-roles";
import { DAY_NIGHT_PHASES } from "./DayNightCycle";
import { GP, GUARD_SCALE, SUNDAY_MARKET } from "../config/gameplayConstants";
import { LANE_WIDTH_PX } from "../utils/kerbsideDropoff";
import { hourOfDay } from "../utils/trafficLanes";
import { closestOnPolyline, placeNamed, placesOfType, type Pt } from "../utils/mapPlaces";
import { calendarOverrides, isFestiveSeason, isRealSunday, sundayProgramme, type SundayProgramme } from "../utils/realCalendar";
import { mixSeed, seededRng } from "../utils/forage";

/** Manu: on Sundays only Paseo de Roxas closes, and its park side becomes a street market. */
export const SUNDAY_CLOSED_ROADS = ["traffic_paseo_eastbound", "traffic_paseo_westbound"] as const;
const MARKET_ROAD = "traffic_paseo_eastbound";
/** The straight stretch of Paseo eastbound along the park's north edge (vertices 4→5). */
const MARKET_SEGMENT = 4;
const MARKET_END_CLEAR_PX = 140;
const STALL_SPACING_PX = 78;
/** Stall rows either side of the aisle, from the carriageway's centre line (+ = park side). */
const STALL_LAT_PX = [-46, 46] as const;
const LIGHTS_HOURS: readonly [number, number] = [17, 23];
/** Shows at 18:00, 19:00, and the 20:00 finale (longer). In-game hours. */
const SHOWS: ReadonlyArray<readonly [number, number]> = [
  [18, 18.5],
  [19, 19.5],
  [20, 20.75],
];
const LIGHTS_RADIUS_PX = 650;
const MAX_TREE_LIGHTS = 420;
const SHOO_DWELL_MS = 2500;
const SHOO_COOLDOWN_MS = 25_000;
const SHOO_PX = 34;
const MUSIC_RANGE_PX = 900;
const LIGHT_DEPTH = 51; // above the day/night overlay (50), like NightLights
const AWNING_DEPTH = 9; // over Mamma Cat (3), under the tree canopy (10)

const AWNINGS = [0xd94f4f, 0xf2b134, 0x3f8fd9, 0x45b36b, 0xe0679b, 0xf07c2a];
const PALETTE = [0xfff1c0, 0xffc04d, 0xff6fb5, 0x6fe0ff, 0xb38cff];
const XMAS_PALETTE = [0xff3b3b, 0x3bff7a, 0xffd34d, 0xfff6e0];
const STALL_KINDS = ["grill", "fish", "fruit", "plants", "crafts", "kakanin", "coffee", "books"] as const;
const FOOD_STALLS: ReadonlySet<string> = new Set(["grill", "fish", "kakanin"]);
const LOOKS = Object.keys(PIXEL_CROWD) as CrowdLookId[];

interface Stall {
  x: number;
  y: number;
  kind: (typeof STALL_KINDS)[number];
  dwellMs: number;
  shooAt: number;
  vendor: Phaser.GameObjects.Sprite;
  awning: Phaser.GameObjects.Graphics;
  along: number;
  side: number;
  look: CrowdLookId;
}

interface Walker {
  sprite: Phaser.GameObjects.Sprite;
  look: CrowdLookId;
  along: number;
  lat: number;
  dir: 1 | -1;
  speed: number;
  pauseMs: number;
  greeted: boolean;
}

interface MarketCat {
  sprite: Phaser.GameObjects.Sprite;
  texture: string;
  home: number;
  along: number;
  lat: number;
  dir: 1 | -1;
  greeted: boolean;
  pauseMs: number;
}

interface RoadClosure {
  day: number;
  barriers: Phaser.GameObjects.Graphics;
  guards: Array<{ sprite: Phaser.GameObjects.Sprite; along: number; parkEdge: number; cityEdge: number }>;
  clear: boolean;
  blocked: boolean;
  greetedAt: number;
  drawnProgress: number;
}

interface Market {
  open: boolean;
  layer: Phaser.GameObjects.Container;
  programmeArt: Phaser.GameObjects.Graphics;
  stalls: Stall[];
  walkers: Walker[];
  busker: Phaser.GameObjects.Sprite;
  notesAt: number;
  /** This week's programme on the closed westbound carriageway: its people (dancers bob to the music). */
  crew: Phaser.GameObjects.Sprite[];
  crewAt: Pt;
  whistled: boolean;
  kidDone: boolean;
  stillMs: number;
  programmeDone: boolean;
  cats: MarketCat[];
  guests: Set<Phaser.GameObjects.Sprite>;
  greetAt: number;
}

interface Lights {
  /** The show's centre: the Exchange Plaza fountain. */
  sx: number;
  sy: number;
  trees: Array<{ img: Phaser.GameObjects.Image; phase: number; base: number }>;
  crowd: Phaser.GameObjects.Sprite[];
  parols: Phaser.GameObjects.Graphics | null;
  butterflies: Array<{ img: Phaser.GameObjects.Image; a: number; r: number; s: number }>;
}

/**
 * Real-world Sundays (device date, locked at each in-game dawn): guards close Paseo before dawn,
 * vendors set up, and its park side is a street market from dawn through evening (stalls, browsers,
 * visiting cats, a busker, vendors who shoo cats
 * off the fish); the in-game evening lights the trees round the Exchange Plaza fountain for the
 * Sunday Lights, with shows at 18:00, 19:00 and an 20:00 finale. 10 Nov – 15 Jan it is the Christmas
 * Festival of Lights.
 */
export class SundaySystem {
  isSunday = false;
  festive = false;
  programme: SundayProgramme = "yoga";
  private wishDay = -1;
  private butterflyDay = -1;
  private lightsStillMs = 0;
  private frameMs = 16;
  private market: Market | null = null;
  private closure: RoadClosure | null = null;
  private lights: Lights | null = null;
  private seg: { a: Pt; b: Pt; len: number; angle: number } | null = null;
  private narratedMarketDay = -1;
  private narratedLightsDay = -1;

  constructor(
    private readonly scene: GameScene,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Decide whether this in-game day is a Sunday (call on create and on every new day). */
  startDay(): void {
    const date = this.now();
    const forced = typeof window !== "undefined" ? calendarOverrides(window.location.search) : {};
    this.isSunday = forced.sunday ?? isRealSunday(date);
    this.festive = forced.festive ?? isFestiveSeason(date);
    this.programme = forced.programme ?? sundayProgramme(date);
    if (this.closure && this.closure.day !== this.scene.dayNight.dayCount) {
      if (this.market) this.closeMarket();
      this.endClosure();
    }
    // Close before TrafficSystem's first update/prewarm when continuing a daylight save.
    const h = this.hour();
    if (this.isSunday && this.scene.dayNight.dayCount >= SUNDAY_MARKET.MIN_DAY && h >= SUNDAY_MARKET.OPEN_HOUR && h < SUNDAY_MARKET.CLOSE_HOUR) {
      this.beginClosure(this.scene.dayNight.dayCount);
    }
  }

  /** In-game clock hour [0, 24). */
  hour(): number {
    const { dayNight } = this.scene;
    const p = DAY_NIGHT_PHASES[dayNight.currentPhase];
    return hourOfDay(p.startHour, DAY_NIGHT_PHASES[p.next].startHour, dayNight.phaseProgress);
  }

  get marketOpen(): boolean {
    return this.market?.open === true;
  }

  get marketStatus(): string {
    if (this.marketOpen) return this.hour() >= SUNDAY_MARKET.PACK_HOUR ? "Packing up at nightfall" : "Open now";
    if (this.market) return "Stallholders are setting up";
    if (this.closure) {
      if (this.closure.day === this.scene.dayNight.dayCount && this.hour() >= SUNDAY_MARKET.CLOSE_HOUR) return "Guards are reopening Paseo";
      return this.closure.clear ? "Guards are placing barriers" : "Guards are clearing Paseo";
    }
    if (this.scene.dayNight.dayCount < SUNDAY_MARKET.MIN_DAY) return "First market: Day 2";
    return "Returns next Dawn";
  }

  update(time: number, delta: number): void {
    this.frameMs = delta;
    const h = this.hour();
    const day = this.scene.dayNight.dayCount;
    const wantMarket = this.isSunday && day >= SUNDAY_MARKET.MIN_DAY && h >= SUNDAY_MARKET.OPEN_HOUR && h < SUNDAY_MARKET.CLOSE_HOUR;
    // The upcoming dawn uses the real local date, including a session crossing local midnight.
    const preparing = h >= SUNDAY_MARKET.PREPARE_HOUR && h < SUNDAY_MARKET.OPEN_HOUR && day + 1 >= SUNDAY_MARKET.MIN_DAY && this.upcomingSunday();
    const wantLights = this.isSunday && h >= LIGHTS_HOURS[0] && h < LIGHTS_HOURS[1];
    if (wantMarket || preparing) {
      this.beginClosure(preparing ? day + 1 : day);
      this.tickClosure(h, time);
      if (this.closure?.blocked && (wantMarket || h >= SUNDAY_MARKET.SETUP_HOUR)) {
        if (!this.market) this.buildMarket();
        if (this.market) {
          this.setupStalls(wantMarket ? 1 : (h - SUNDAY_MARKET.SETUP_HOUR) / (SUNDAY_MARKET.OPEN_HOUR - SUNDAY_MARKET.SETUP_HOUR));
          if (wantMarket && !this.market.open) this.openMarket();
        }
      }
    } else {
      if (this.market) this.closeMarket();
      if (this.closure) {
        if (this.isSunday && this.closure.day === day && h >= SUNDAY_MARKET.CLOSE_HOUR && h < SUNDAY_MARKET.REOPEN_HOUR) this.tickClosure(h, time, true);
        else this.endClosure();
      }
    }
    if (wantLights && !this.lights) this.lightUp();
    if (!wantLights && this.lights) this.lightsOff();

    let music = 0;
    if (this.marketOpen) music = Math.max(music, this.tickMarket(time, delta) * 0.6);
    if (this.lights) music = Math.max(music, this.tickLights(time, h));
    this.scene.audio?.setFestival(music);
  }

  destroy(): void {
    if (this.market) this.closeMarket();
    this.endClosure();
    if (this.lights) this.lightsOff();
  }

  private upcomingSunday(): boolean {
    const forced = typeof window !== "undefined" ? calendarOverrides(window.location.search) : {};
    const date = this.now();
    const sunday = forced.sunday ?? isRealSunday(date);
    if (sunday) this.programme = forced.programme ?? sundayProgramme(date);
    return sunday;
  }

  // ──────────── the market ────────────

  private segment() {
    if (this.seg) return this.seg;
    const pts = placeNamed(this.scene.places, MARKET_ROAD)?.polyline;
    const a = pts?.[MARKET_SEGMENT];
    const b = pts?.[MARKET_SEGMENT + 1];
    if (!a || !b) return null;
    this.seg = { a, b, len: Math.hypot(b.x - a.x, b.y - a.y), angle: Math.atan2(b.y - a.y, b.x - a.x) };
    return this.seg;
  }

  /** Along the market stretch (px from its start) and across it (+ = park side) to world px. */
  private at(along: number, lat: number): Pt {
    const s = this.seg!;
    const c = Math.cos(s.angle);
    const n = Math.sin(s.angle);
    return { x: s.a.x + c * along - n * lat, y: s.a.y + n * along + c * lat };
  }

  /** Both carriageways' outer edges, measured across the market's centre line. */
  private roadEdges(along: number): [number, number] {
    const point = this.at(along, 0);
    const seg = this.seg!;
    let lo = 0;
    let hi = 0;
    for (const name of SUNDAY_CLOSED_ROADS) {
      const road = placeNamed(this.scene.places, name);
      if (!road?.polyline) continue;
      const near = closestOnPolyline(road.polyline, point);
      const lat = -(near.x - point.x) * Math.sin(seg.angle) + (near.y - point.y) * Math.cos(seg.angle);
      const half = Math.max(1, Number(road.props.lanes) || 1) * LANE_WIDTH_PX / 2;
      lo = Math.min(lo, lat - half);
      hi = Math.max(hi, lat + half);
    }
    return [lo, hi];
  }

  private beginClosure(day: number): void {
    if (this.closure) return;
    const seg = this.segment();
    if (!seg) return;
    this.scene.traffic.setClosedRoads(SUNDAY_CLOSED_ROADS);
    const barriers = this.scene.add.graphics().setPosition(seg.a.x, seg.a.y).setRotation(seg.angle).setDepth(AWNING_DEPTH - 1);
    const guards = [MARKET_END_CLEAR_PX - 40, seg.len - MARKET_END_CLEAR_PX + 40].map((along) => {
      const [cityEdge, parkEdge] = this.roadEdges(along);
      const p = this.at(along, parkEdge + 24);
      const sprite = this.scene.add.sprite(p.x, p.y, "guard", 4).setScale(GUARD_SCALE).setOrigin(0.5, 1).setDepth(3 + p.y / 100000);
      return { sprite, along, parkEdge: parkEdge + 24, cityEdge: cityEdge - 16 };
    });
    this.closure = { day, barriers, guards, clear: false, blocked: false, greetedAt: -Infinity, drawnProgress: -1 };
  }

  private tickClosure(hour: number, time: number, releasing = false): void {
    const c = this.closure;
    if (!c) return;
    c.clear = this.scene.traffic.carsOnClosedRoads() === 0;
    const progress = releasing
      ? 1 - Phaser.Math.Clamp((hour - SUNDAY_MARKET.CLOSE_HOUR) / (SUNDAY_MARKET.REOPEN_HOUR - SUNDAY_MARKET.CLOSE_HOUR), 0, 1)
      : hour >= SUNDAY_MARKET.OPEN_HOUR ? 1 : Phaser.Math.Clamp((hour - SUNDAY_MARKET.BARRIERS_HOUR) / (SUNDAY_MARKET.SETUP_HOUR - SUNDAY_MARKET.BARRIERS_HOUR), 0, 1);
    c.blocked = c.clear && progress === 1;
    const draw = c.drawnProgress !== (c.clear ? progress : 0);
    if (draw) {
      c.barriers.clear();
      c.drawnProgress = c.clear ? progress : 0;
    }
    for (const guard of c.guards) {
      // Guards wait on the kerb while cars drain; only sweep the asphalt once it is empty.
      const sweep = c.clear && !releasing && hour < SUNDAY_MARKET.SETUP_HOUR && this.scene.registry.get("MOTION_REDUCED") !== true
        ? Math.sin(Phaser.Math.Clamp((hour - SUNDAY_MARKET.PREPARE_HOUR) / (SUNDAY_MARKET.SETUP_HOUR - SUNDAY_MARKET.PREPARE_HOUR), 0, 1) * Math.PI)
        : 0;
      const p = this.at(guard.along, guard.parkEdge + (guard.cityEdge - guard.parkEdge) * sweep);
      this.moveGuard(guard.sprite, p);
      if (c.clear && draw) {
        const [lo, hi] = this.roadEdges(guard.along);
        for (let lat = lo; lat <= lo + (hi - lo) * progress && progress > 0; lat += 22) {
          c.barriers.fillStyle(0xf07c2a).fillRect(guard.along - 5, lat - 7, 10, 14);
          c.barriers.fillStyle(0xffffff).fillRect(guard.along - 5, lat - 3, 10, 3);
        }
      }
      if (!this.marketOpen && time >= c.greetedAt && !this.scene.playerInputFrozen && !this.scene.dialogue.isActive && Phaser.Math.Distance.Between(p.x, p.y, this.scene.player.x, this.scene.player.y) < GP.NARRATION_WITNESS_DIST) {
        c.greetedAt = time + SUNDAY_MARKET.GREET_COOLDOWN_MS;
        this.bubble(p.x, p.y - 40, releasing ? "All packed away. Open Paseo, please!" : c.clear ? "Barriers first, then the stalls. Ready for dawn!" : "Last cars through, please. Sunday market setting up!");
      }
    }
  }

  private moveGuard(sprite: Phaser.GameObjects.Sprite, p: Pt): void {
    const dx = p.x - sprite.x;
    const dy = p.y - sprite.y;
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
    if (Math.hypot(dx, dy) > 0.05 && this.scene.anims.exists(`guard-walk-${dir}`)) sprite.play(`guard-walk-${dir}`, true);
    else {
      sprite.anims.stop();
      sprite.setTexture("guard", 4);
    }
    sprite.setPosition(p.x, p.y).setDepth(3 + p.y / 100000);
  }

  private endClosure(): void {
    if (!this.closure) return;
    this.closure.barriers.destroy();
    for (const g of this.closure.guards) g.sprite.destroy();
    this.closure = null;
    this.scene.traffic.setClosedRoads([]);
  }

  private buildMarket(): void {
    const seg = this.segment();
    if (!seg) return;
    const scene = this.scene;
    const rng = seededRng(mixSeed(this.closure?.day ?? scene.dayNight.dayCount, 7));
    const layer = scene.add.container(seg.a.x, seg.a.y).setRotation(seg.angle).setDepth(AWNING_DEPTH);
    const g = scene.add.graphics();
    layer.add(g);
    const start = MARKET_END_CLEAR_PX;
    const end = seg.len - MARKET_END_CLEAR_PX;

    const stalls: Stall[] = [];
    for (const side of STALL_LAT_PX) {
      for (let along = start; along <= end; along += STALL_SPACING_PX) {
        const kind = STALL_KINDS[Math.floor(rng() * STALL_KINDS.length)]!;
        const color = AWNINGS[Math.floor(rng() * AWNINGS.length)]!;
        const g = scene.add.graphics();
        layer.add(g);
        const away = Math.sign(side) * 14; // the awning sits back from the aisle
        g.fillStyle(0x000000, 0.18).fillRect(along - 24, side + away - 12, 50, 28);
        g.fillStyle(color).fillRect(along - 26, side + away - 14, 52, 26);
        g.fillStyle(0xffffff, 0.75);
        for (let k = -20; k < 26; k += 13) g.fillRect(along + k, side + away - 14, 6, 26);
        g.fillStyle(0x6b4a2b).fillRect(along - 24, side - Math.sign(side) * 2 - 3, 48, 7);
        const goods = kind === "fruit" ? 0xffa53b : kind === "plants" ? 0x3f9a4a : kind === "fish" ? 0xb8d4e0 : kind === "grill" ? 0x8a3b1f : 0xe8d9b0;
        g.fillStyle(goods);
        for (let k = -18; k <= 18; k += 6) g.fillCircle(along + k, side - Math.sign(side) * 2, 2);
        const vp = this.at(along, side + Math.sign(side) * 22);
        const look = LOOKS[Math.floor(rng() * LOOKS.length)]!;
        const vendor = this.person(look, vp.x, vp.y, side > 0 ? "N" : "S"); // facing the aisle
        const front = this.at(along, side - Math.sign(side) * 16);
        stalls.push({ x: front.x, y: front.y, kind, dwellMs: 0, shooAt: -Infinity, vendor, awning: g, along, side, look });
      }
    }

    const walkers: Walker[] = [];
    for (let i = 0; i < 18; i++) {
      const look = LOOKS[Math.floor(rng() * LOOKS.length)]!;
      const along = start + rng() * (end - start);
      const lat = (rng() - 0.5) * 34;
      const p = this.at(along, lat);
      walkers.push({ sprite: this.person(look, p.x, p.y, "E"), look, along, lat, dir: rng() < 0.5 ? 1 : -1, speed: 16 + rng() * 14, pauseMs: rng() * 3000, greeted: false });
    }
    const bp = this.at(seg.len / 2, 100);
    const busker = this.person("teen", bp.x, bp.y, "N");

    const crewAt = this.at(seg.len * 0.55, -150);
    const crew = this.buildProgramme(g, seg.len * 0.55, -150, rng);
    const cats: MarketCat[] = ["fluffy", "tiger"].map((texture, i) => {
      const home = seg.len * (0.35 + i * 0.3);
      const lat = i === 0 ? 12 : -12;
      const p = this.at(home, lat);
      const sprite = scene.add.sprite(p.x, p.y, texture, 0).setScale(0.7).setDepth(3 + p.y / 100000);
      return { sprite, texture, home, along: home, lat, dir: i === 0 ? 1 : -1, greeted: false, pauseMs: 1000 + rng() * 3000 };
    });
    this.market = { open: false, layer, programmeArt: g, stalls, walkers, busker, notesAt: 0, crew, crewAt, whistled: false, kidDone: false, stillMs: 0, programmeDone: false, cats, guests: new Set(), greetAt: 0 };
    for (const s of [...crew, ...walkers.map((w) => w.sprite), ...cats.map((c) => c.sprite), busker]) s.setVisible(false);
    g.setVisible(false);
  }

  /** Vendors walk their tables into place; awnings go up one by one before dawn. */
  private setupStalls(progress: number): void {
    const m = this.market;
    if (!m || m.open) return;
    m.stalls.forEach((s, i) => {
      const p = progress >= 1 ? 1 : Phaser.Math.Clamp((progress - i / Math.max(1, m.stalls.length - 1) * 0.8) / 0.2, 0, 1);
      const walk = this.scene.registry.get("MOTION_REDUCED") === true ? 1 : p;
      const at = this.at(s.along + (1 - walk) * 36, 120 + (s.side + Math.sign(s.side) * 22 - 120) * walk);
      s.awning.setAlpha(p);
      s.vendor.setVisible(p > 0).setPosition(at.x, at.y).setDepth(3 + at.y / 100000);
      if (p > 0 && p < 1) {
        const key = CROWD_LOOKS[s.look].walk?.up;
        if (key && this.scene.anims.exists(key)) s.vendor.play(key, true);
      } else if (p === 1) {
        s.vendor.anims.stop();
        this.face(s.vendor, s.look, s.side > 0 ? "N" : "S");
      }
    });
  }

  private openMarket(): void {
    const m = this.market;
    if (!m) return;
    const scene = this.scene;
    const seg = this.seg!;
    m.open = true;
    m.programmeArt.setVisible(true);
    for (const s of [...m.crew, ...m.walkers.map((w) => w.sprite), ...m.cats.map((c) => c.sprite), m.busker]) s.setVisible(true);
    // a few seeded finds in the aisle, gone when the market packs up
    const aisle: Pt[] = [];
    for (let along = MARKET_END_CLEAR_PX; along <= seg.len - MARKET_END_CLEAR_PX; along += 12) aisle.push(this.at(along, (Math.sin(along) * 0.5) * 24));
    scene.forage?.setMarketSpots(aisle);

    if (this.narratedMarketDay !== scene.dayNight.dayCount) {
      this.narratedMarketDay = scene.dayNight.dayCount;
      const extra: Record<SundayProgramme, string> = {
        yoga: "On the far side of the road, people are doing yoga on mats.",
        zumba: "Somewhere past the stalls, a Zumba class is shouting along to the music.",
        adoption: "The volunteers have an adoption stall today.",
        chalk: "Kids have chalked drawings all over the far side of the road.",
        visitor: "Someone has brought their cat to the market. In a harness.",
      };
      this.narrate(`Sunday. Paseo de Roxas is closed to cars: a street market, music, and the smell of grilled corn. ${extra[this.programme]}`);
    }
  }

  private tickMarket(time: number, delta: number): number {
    const m = this.market!;
    const seg = this.seg!;
    const start = MARKET_END_CLEAR_PX;
    const end = seg.len - MARKET_END_CLEAR_PX;
    for (const w of m.walkers) {
      if (w.pauseMs > 0) {
        w.pauseMs -= delta;
        if (w.pauseMs <= 0) this.walk(w);
        continue;
      }
      w.along += w.dir * w.speed * (delta / 1000);
      if (w.along < start || w.along > end) {
        w.dir = w.dir === 1 ? -1 : 1;
        w.along = Phaser.Math.Clamp(w.along, start, end);
        this.walk(w);
      }
      const p = this.at(w.along, w.lat);
      w.sprite.setPosition(p.x, p.y).setDepth(3 + p.y / 100000);
      if (Math.random() < delta / 9000) {
        // stop at a stall for a look
        w.pauseMs = 1200 + Math.random() * 2600;
        w.sprite.anims.stop();
        this.face(w.sprite, w.look, w.lat >= 0 ? "S" : "N");
      }
    }

    // vendors at the food stalls shoo a cat who lingers
    const { player } = this.scene;
    for (const s of m.stalls) {
      if (!FOOD_STALLS.has(s.kind)) continue;
      const close = Phaser.Math.Distance.Between(player.x, player.y, s.x, s.y) < SHOO_PX;
      s.dwellMs = close ? s.dwellMs + delta : 0;
      if (s.dwellMs > SHOO_DWELL_MS && time - s.shooAt > SHOO_COOLDOWN_MS) {
        s.shooAt = time;
        s.dwellMs = 0;
        this.bubble(s.vendor.x, s.vendor.y - 30, Math.random() < 0.5 ? "Shoo! Shoo, pusa!" : "Hoy! Not the fish!");
        this.scene.emotes.show(this.scene, player, "alert");
        player.startle();
      }
    }

    if (time > m.notesAt) {
      m.notesAt = time + 900;
      this.floatNote(m.busker.x + 6, m.busker.y - 26);
      if (this.programme === "zumba") this.floatNote(m.crewAt.x, m.crewAt.y - 40);
    }
    // Zumba: everyone bounces, turning on the beat
    if (this.programme === "zumba") {
      const beat = Math.floor(time / 470);
      m.crew.forEach((p, i) => {
        p.setY((p.getData("y") as number) - (beat % 2 === i % 2 ? 3 : 0));
        if (i > 0) p.setFlipX(beat % 4 < 2);
      });
    }
    this.marketMoments(m, delta);
    this.tickVisitors(m, time, delta);
    // Pack up at the end of Evening; clear people before the guards lift the barriers.
    const h = this.hour();
    if (h >= SUNDAY_MARKET.PACK_HOUR && !m.whistled) {
      m.whistled = true;
      this.bubble(m.busker.x, m.busker.y - 40, "Tweeeet! Packing up at nightfall, everyone!");
    }
    if (h >= SUNDAY_MARKET.PACK_HOUR) m.layer.setAlpha(Phaser.Math.Clamp((SUNDAY_MARKET.CLOSE_HOUR - h) / (SUNDAY_MARKET.CLOSE_HOUR - SUNDAY_MARKET.PACK_HOUR), 0.25, 1));
    const d = Phaser.Math.Distance.Between(player.x, player.y, m.busker.x, m.busker.y);
    return Math.max(0, 1 - d / MUSIC_RANGE_PX);
  }

  /** Two visiting cats and occasional greetings, without changing colony or story state. */
  private tickVisitors(m: Market, time: number, delta: number): void {
    const { player } = this.scene;
    const canGreet = !player.isResting && !this.scene.playerInputFrozen && !this.scene.dialogue.isActive && time >= m.greetAt;
    for (const c of m.cats) {
      if (c.pauseMs > 0) c.pauseMs -= delta;
      else {
        c.along += c.dir * delta * 0.012;
        if (Math.abs(c.along - c.home) >= 90) {
          c.along = Phaser.Math.Clamp(c.along, c.home - 90, c.home + 90);
          c.dir = c.dir === 1 ? -1 : 1;
          c.pauseMs = 2000;
        }
      }
      const p = this.at(c.along, c.lat);
      c.sprite.setPosition(p.x, p.y).setDepth(3 + p.y / 100000).setFlipX(c.dir < 0);
      const key = `${c.texture}-${c.pauseMs > 0 ? "sit-down" : "walk"}`;
      if (this.scene.anims.exists(key)) c.sprite.play(key, true);
      if (canGreet && time >= m.greetAt && !c.greeted && Phaser.Math.Distance.Between(p.x, p.y, player.x, player.y) < GP.INTERACTION_DIST) {
        c.greeted = true;
        c.pauseMs = 3000;
        m.greetAt = time + SUNDAY_MARKET.GREET_COOLDOWN_MS;
        this.bubble(p.x, p.y - 24, c.texture === "fluffy" ? "New smells? The plain fish is the best bit." : "Breakfast, lunch AND supper. I like Sundays.");
        this.scene.emotes.show(this.scene, c.sprite, "heart");
      }
    }
    if (canGreet && time >= m.greetAt) {
      const w = m.walkers.find((w) => !w.greeted && Phaser.Math.Distance.Between(w.sprite.x, w.sprite.y, player.x, player.y) < GP.CAT_PERSON_GREET_DIST);
      if (w) {
        w.greeted = true;
        w.pauseMs = 2500;
        w.sprite.anims.stop();
        this.face(w.sprite, w.look, player.y > w.sprite.y ? "S" : "N");
        m.greetAt = time + SUNDAY_MARKET.GREET_COOLDOWN_MS;
        this.bubble(w.sprite.x, w.sprite.y - 34, "Hello, little market cat! Just looking? Me too.");
      }
    }
  }

  /** Her small Sunday moments: a kid who wants to pet her, and this week's programme up close. */
  private marketMoments(m: Market, delta: number): void {
    const { player } = this.scene;
    if (player.isResting || this.scene.playerInputFrozen || this.scene.dialogue.isActive) {
      m.stillMs = 0;
      return;
    }
    const body = player.body as Phaser.Physics.Arcade.Body | null;
    const still = (body?.velocity.length() ?? 1) < 1;
    const seg = this.seg!;
    const inAisle = this.onMarket(player.x, player.y, 70);
    m.stillMs = still && inAisle ? m.stillMs + delta : 0;
    if (!m.kidDone && m.stillMs > 2500) {
      m.kidDone = true;
      const a = Phaser.Math.Angle.Between(seg.a.x, seg.a.y, seg.b.x, seg.b.y);
      const from = { x: player.x + Math.cos(a) * 110, y: player.y + Math.sin(a) * 110 };
      const kid = this.person("student", from.x, from.y, "W").setScale(CROWD_LOOKS.student.scale * 0.8);
      m.guests.add(kid);
      this.scene.tweens.add({
        targets: kid,
        x: player.x + 26,
        y: player.y,
        duration: 1600,
        onComplete: () => {
          if (this.market !== m || !m.open) return;
          this.bubble(kid.x, kid.y - 34, "Ay, ang cute! Kitty, kitty!");
          this.scene.emotes.show(this.scene, player, "heart");
          this.scene.time.delayedCall(1800, () => {
            if (this.market === m && m.open) this.bubble(kid.x + 10, kid.y - 50, "Gently, anak. Let her come to you.");
          });
          this.scene.time.delayedCall(4200, () => {
            if (this.market !== m || !m.open) return;
            this.scene.tweens.add({ targets: kid, x: from.x, y: from.y, alpha: 0, duration: 1800, onComplete: () => { m.guests.delete(kid); kid.destroy(); } });
          });
        },
      });
    }
    if (!m.programmeDone && Phaser.Math.Distance.Between(player.x, player.y, m.crewAt.x, m.crewAt.y) < 70) {
      m.programmeDone = true;
      const lines: Record<SundayProgramme, string> = {
        yoga: "Someone says \"cat pose\". You were already doing it.",
        zumba: "Forty people jump at once. You do not jump. You judge.",
        adoption: "Kittens in crates, a sign that says ADOPT, DON'T SHOP, and a volunteer telling every passer-by their names.",
        chalk: "A chalk cat, bigger than you. You sit on it. Now there are two cats.",
        visitor: "The visitor cat stares at you from its harness. \"Say hi, Mochi!\" Mochi does not say hi.",
      };
      this.bubble(player.x, player.y - 36, lines[this.programme]);
    }
  }

  /** On the closed road, within `pad` px of the market's middle line. */
  private onMarket(x: number, y: number, pad: number): boolean {
    const seg = this.seg;
    if (!seg) return false;
    const c = Math.cos(seg.angle);
    const n = Math.sin(seg.angle);
    const along = (x - seg.a.x) * c + (y - seg.a.y) * n;
    const lat = -(x - seg.a.x) * n + (y - seg.a.y) * c;
    return along > 0 && along < seg.len && Math.abs(lat) < pad;
  }

  /** This week's programme, drawn at (along, lat) of the market stretch; returns its people. */
  private buildProgramme(g: Phaser.GameObjects.Graphics, along: number, lat: number, rng: () => number): Phaser.GameObjects.Sprite[] {
    const people: Phaser.GameObjects.Sprite[] = [];
    const add = (dx: number, dy: number, facing: Facing, look = LOOKS[Math.floor(rng() * LOOKS.length)]!) => {
      const p = this.at(along + dx, lat + dy);
      const s = this.person(look, p.x, p.y, facing).setData("y", p.y);
      people.push(s);
      return s;
    };
    switch (this.programme) {
      case "yoga":
        for (let i = 0; i < 8; i++) {
          const dx = (i % 4) * 34 - 51;
          const dy = Math.floor(i / 4) * 30 - 15;
          g.fillStyle([0x7fb3d5, 0xc39bd3, 0x76d7c4, 0xf7dc6f][i % 4]!).fillRect(along + dx - 9, lat + dy - 6, 18, 26);
          add(dx, dy + 10, "N");
        }
        add(0, -48, "S", "youngPro");
        break;
      case "zumba":
        add(0, -46, "S", "youngPro");
        for (let i = 0; i < 9; i++) add((i % 3) * 30 - 30, Math.floor(i / 3) * 26 - 4, "N");
        break;
      case "adoption": {
        g.fillStyle(0xf2f2f2).fillRect(along - 40, lat - 26, 80, 14);
        for (let i = 0; i < 3; i++) {
          g.fillStyle(0x6b4a2b).fillRect(along - 36 + i * 26, lat - 8, 20, 16);
          g.lineStyle(1, 0xdddddd).strokeRect(along - 36 + i * 26, lat - 8, 20, 16);
        }
        add(-50, 14, "S", "lola");
        const sign = this.at(along, lat - 19);
        people.push(
          this.scene.add.text(sign.x, sign.y, "ADOPT, DON'T SHOP ♥", { fontSize: "6px", color: "#c0392b", fontStyle: "bold", resolution: 3 }).setOrigin(0.5).setDepth(AWNING_DEPTH + 0.5) as unknown as Phaser.GameObjects.Sprite,
        );
        for (let i = 0; i < 3; i++) {
          const p = this.at(along - 26 + i * 26, lat);
          people.push(this.scene.add.sprite(p.x, p.y, ["fluffy", "tiger", "jayco"][i]!, 0).setScale(0.45).setDepth(AWNING_DEPTH + 0.4));
        }
        break;
      }
      case "chalk": {
        const colors = [0xffb3ba, 0xbaffc9, 0xbae1ff, 0xffffba, 0xe0bbff];
        for (let i = 0; i < 14; i++) {
          g.lineStyle(2, colors[i % colors.length]!, 0.8);
          g.strokeCircle(along - 80 + rng() * 160, lat - 30 + rng() * 60, 4 + rng() * 8);
        }
        // the big chalk cat
        g.lineStyle(2, 0xffffff, 0.9).strokeCircle(along, lat, 16).strokeCircle(along, lat - 22, 10);
        g.strokeTriangle(along - 9, lat - 28, along - 4, lat - 31, along - 9, lat - 37).strokeTriangle(along + 9, lat - 28, along + 4, lat - 31, along + 9, lat - 37);
        for (let i = 0; i < 5; i++) g.strokeRect(along + 40 + i * 14, lat - 6, 12, 12);
        add(-60, 30, "N", "teen");
        break;
      }
      case "visitor": {
        add(0, 0, "S", "expat");
        const p = this.at(along + 16, lat + 8);
        people.push(this.scene.add.sprite(p.x, p.y, "fluffy", 0).setScale(0.75).setTint(0xfff4e0).setDepth(3 + p.y / 100000));
        break;
      }
    }
    return people;
  }

  private closeMarket(): void {
    const m = this.market!;
    m.open = false;
    m.layer.destroy();
    for (const p of m.crew) p.destroy();
    for (const s of m.stalls) s.vendor.destroy();
    for (const w of m.walkers) w.sprite.destroy();
    for (const c of m.cats) c.sprite.destroy();
    for (const kid of m.guests) {
      this.scene.tweens.killTweensOf(kid);
      kid.destroy();
    }
    m.busker.destroy();
    this.market = null;
    this.scene.forage?.setMarketSpots(null);
  }

  // ──────────── the lights ────────────

  private lightUp(): void {
    const scene = this.scene;
    const stage = scene.map.findObject("spawns", (o) => o.name === "poi_fountain_exchange");
    if (!stage || !scene.textures.exists("light_glow")) return;
    const sx = stage.x ?? 0;
    const sy = stage.y ?? 0;
    const rng = seededRng(mixSeed(scene.dayNight.dayCount, 17));
    const palette = this.festive ? XMAS_PALETTE : PALETTE;
    const ts = scene.map.tileWidth;
    const cells: Pt[] = [];
    scene.overheadLayer?.forEachTile((t) => {
      if (t.index <= 0) return;
      const x = t.pixelX + ts / 2;
      const y = t.pixelY + ts / 2;
      if (Phaser.Math.Distance.Between(x, y, sx, sy) < LIGHTS_RADIUS_PX) cells.push({ x, y });
    });
    const step = Math.max(1, Math.ceil(cells.length / MAX_TREE_LIGHTS));
    const trees = cells
      .filter((_, i) => i % step === 0)
      .map((c) => ({
        img: scene.add
          .image(c.x + (rng() - 0.5) * 10, c.y + (rng() - 0.5) * 10, "light_glow")
          .setDepth(LIGHT_DEPTH)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setTint(palette[Math.floor(rng() * palette.length)]!)
          .setScale(0.05 + rng() * 0.04)
          .setAlpha(0),
        phase: rng() * Math.PI * 2,
        base: 0.8 + rng() * 0.2,
      }));

    const crowd: Phaser.GameObjects.Sprite[] = [];
    for (let i = 0; i < 16; i++) {
      const a = rng() * Math.PI * 2;
      const r = 70 + rng() * 110;
      const x = sx + Math.cos(a) * r;
      const y = sy + Math.sin(a) * r;
      if (!scene.isInPark(x, y)) continue;
      const look = LOOKS[Math.floor(rng() * LOOKS.length)]!;
      const dx = sx - x;
      const dy = sy - y;
      const facing: Facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "E" : "W") : dy > 0 ? "S" : "N";
      crowd.push(this.person(look, x, y, facing));
    }

    let parols: Phaser.GameObjects.Graphics | null = null;
    if (this.festive) {
      parols = scene.add.graphics().setDepth(LIGHT_DEPTH).setBlendMode(Phaser.BlendModes.ADD);
      for (const lamp of placesOfType(scene.places, "lamp")) {
        if (Phaser.Math.Distance.Between(lamp.x, lamp.y, sx, sy) > LIGHTS_RADIUS_PX) continue;
        this.star(parols, lamp.x, lamp.y - 16, 7, palette[Math.floor(rng() * palette.length)]!);
      }
    }

    const butterflies = Array.from({ length: 10 }, () => ({
      img: scene.add.image(sx, sy, "light_glow").setDepth(LIGHT_DEPTH).setBlendMode(Phaser.BlendModes.ADD).setScale(0.07).setTint(0xbfe8ff).setAlpha(0),
      a: rng() * Math.PI * 2,
      r: 40 + rng() * 160,
      s: 0.3 + rng() * 0.5,
    }));

    this.lights = { sx, sy, trees, crowd, parols, butterflies };
    if (this.narratedLightsDay !== scene.dayNight.dayCount) {
      this.narratedLightsDay = scene.dayNight.dayCount;
      this.narrate(
        this.festive
          ? "The Festival of Lights. Parols glow over the fountain, and the trees are full of stars."
          : "Sunday Lights. The trees round the fountain are coming alight, and people are gathering.",
      );
    }
  }

  private tickLights(time: number, hour: number): number {
    const L = this.lights!;
    const show = SHOWS.find(([a, b]) => hour >= a && hour < b);
    const finale = show !== undefined && show === SHOWS[SHOWS.length - 1];
    const fadeIn = Math.min(1, (hour - LIGHTS_HOURS[0]) / 0.5);
    const fadeOut = Math.min(1, (LIGHTS_HOURS[1] - hour) / 0.5);
    const level = Math.max(0, Math.min(fadeIn, fadeOut));
    const t = time / 1000;
    const speed = show ? (finale ? 7 : 4.5) : 1.2;
    for (const tree of L.trees) {
      const wave = 0.5 + 0.5 * Math.sin(t * speed + tree.phase + (show ? tree.img.x * 0.01 : 0));
      tree.img.setAlpha(level * tree.base * (show ? 0.35 + 0.65 * wave : 0.55 + 0.25 * wave));
    }
    L.parols?.setAlpha(level * (0.75 + 0.25 * Math.sin(t * 2)));
    // projected butterflies drift round the fountain during the shows; she can't catch light
    const { player } = this.scene;
    const day = this.scene.dayNight.dayCount;
    for (const b of L.butterflies) {
      b.a += b.s * 0.016 * (show ? 2 : 1);
      b.img.setPosition(L.sx + Math.cos(b.a) * b.r, L.sy + Math.sin(b.a * 1.3) * b.r * 0.6).setAlpha(show ? 0.9 * level : 0);
      if (show && Phaser.Math.Distance.Between(player.x, player.y, b.img.x, b.img.y) < 16) {
        b.a += 0.9; // darts away
        if (this.butterflyDay !== day) {
          this.butterflyDay = day;
          this.bubble(player.x, player.y - 36, "You pounce. Your paws close on nothing. Light can't be caught.");
        }
      }
    }
    // a wish at the fountain: sit still by the lit water
    const body = player.body as Phaser.Physics.Arcade.Body | null;
    const nearFountain = Phaser.Math.Distance.Between(player.x, player.y, L.sx, L.sy) < 150;
    this.lightsStillMs = nearFountain && (body?.velocity.length() ?? 1) < 1 ? this.lightsStillMs + this.frameMs : 0;
    if (this.wishDay !== day && this.lightsStillMs > 3000 && level > 0.5) {
      this.wishDay = day;
      this.narrate("The lights shiver in the fountain. If cats made wishes, this is where they'd make them. You make one anyway.");
    }
    for (const p of L.crowd) p.setVisible(hour < 22);
    const near = Math.max(0, 1 - Phaser.Math.Distance.Between(player.x, player.y, L.sx, L.sy) / MUSIC_RANGE_PX);
    return level * near * (show ? 1 : 0.25);
  }

  private lightsOff(): void {
    const L = this.lights!;
    for (const t of L.trees) t.img.destroy();
    for (const p of L.crowd) p.destroy();
    for (const b of L.butterflies) b.img.destroy();
    L.parols?.destroy();
    this.lights = null;
  }

  // ──────────── helpers ────────────

  private person(look: CrowdLookId, x: number, y: number, facing: Facing): Phaser.GameObjects.Sprite {
    const L = CROWD_LOOKS[look];
    const [tex, frame] = L.face[facing];
    return this.scene.add
      .sprite(x, y, tex, frame)
      .setOrigin(L.originX, L.originY)
      .setScale(L.scale)
      .setFlipX(L.sideView && facing === "W")
      .setDepth(3 + y / 100000);
  }

  private face(sprite: Phaser.GameObjects.Sprite, look: CrowdLookId, facing: Facing): void {
    const L = CROWD_LOOKS[look];
    const [tex, frame] = L.face[facing];
    sprite.setTexture(tex, frame).setFlipX(L.sideView && facing === "W");
  }

  private walk(w: Walker): void {
    const L = CROWD_LOOKS[w.look];
    // market stretch runs ENE, so "east along it" reads as walking right
    const dir = w.dir === 1 ? "right" : "left";
    const key = L.walk?.[dir];
    if (key && this.scene.anims.exists(key)) {
      w.sprite.play(key, true).setFlipX(L.sideView && dir === "left");
    } else this.face(w.sprite, w.look, w.dir === 1 ? "E" : "W");
  }

  private star(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, color: number): void {
    const pts: Phaser.Types.Math.Vector2Like[] = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 === 0 ? r : r * 0.45;
      pts.push({ x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr });
    }
    g.fillStyle(color, 0.95).fillPoints(pts, true);
    g.fillStyle(color, 0.25).fillCircle(x, y, r * 1.8);
  }

  private bubble(x: number, y: number, text: string): void {
    const t = this.scene.add
      .text(x, y, text, { fontFamily: "Arial, Helvetica, sans-serif", fontSize: "10px", color: "#1a1a1a", backgroundColor: "#f6f0d8", padding: { x: 4, y: 2 }, resolution: 2 })
      .setOrigin(0.5)
      .setDepth(100);
    this.scene.tweens.add({ targets: t, alpha: 0, delay: 1600, duration: 500, onComplete: () => t.destroy() });
  }

  private floatNote(x: number, y: number): void {
    const n = this.scene.add
      .text(x, y, Math.random() < 0.5 ? "♪" : "♫", { fontSize: "11px", color: "#fff1c0", stroke: "#000000", strokeThickness: 2, resolution: 2 })
      .setOrigin(0.5)
      .setDepth(100);
    this.scene.tweens.add({ targets: n, y: y - 22, x: x + (Math.random() - 0.5) * 16, alpha: 0, duration: 1600, onComplete: () => n.destroy() });
  }

  private narrate(line: string): void {
    (this.scene.scene.get("HUDScene") as HUDScene | undefined)?.showNarration(line);
  }
}
