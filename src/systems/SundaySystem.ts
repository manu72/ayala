import Phaser from "phaser";
import type { GameScene } from "../scenes/GameScene";
import type { HUDScene } from "../scenes/HUDScene";
import { CROWD_LOOKS, PIXEL_CROWD, type CrowdLookId, type Facing } from "../data/ambient-roles";
import { DAY_NIGHT_PHASES } from "./DayNightCycle";
import { hourOfDay } from "../utils/trafficLanes";
import { placeNamed, placesOfType, type Pt } from "../utils/mapPlaces";
import { calendarOverrides, isFestiveSeason, isRealSunday } from "../utils/realCalendar";
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
const MARKET_HOURS: readonly [number, number] = [6, 10];
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
}

interface Walker {
  sprite: Phaser.GameObjects.Sprite;
  look: CrowdLookId;
  along: number;
  lat: number;
  dir: 1 | -1;
  speed: number;
  pauseMs: number;
}

interface Market {
  layer: Phaser.GameObjects.Container;
  stalls: Stall[];
  walkers: Walker[];
  busker: Phaser.GameObjects.Sprite;
  notesAt: number;
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
 * Real-world Sundays (device date, locked at each in-game dawn): the in-game morning closes Paseo de
 * Roxas and its park side becomes a street market (stalls, browsers, a busker, vendors who shoo cats
 * off the fish); the in-game evening lights the trees round the Exchange Plaza fountain for the
 * Sunday Lights, with shows at 18:00, 19:00 and an 20:00 finale. 10 Nov – 15 Jan it is the Christmas
 * Festival of Lights.
 */
export class SundaySystem {
  isSunday = false;
  festive = false;
  private market: Market | null = null;
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
  }

  /** In-game clock hour [0, 24). */
  hour(): number {
    const { dayNight } = this.scene;
    const p = DAY_NIGHT_PHASES[dayNight.currentPhase];
    return hourOfDay(p.startHour, DAY_NIGHT_PHASES[p.next].startHour, dayNight.phaseProgress);
  }

  get marketOpen(): boolean {
    return this.market !== null;
  }

  update(time: number, delta: number): void {
    const h = this.hour();
    const wantMarket = this.isSunday && h >= MARKET_HOURS[0] && h < MARKET_HOURS[1];
    const wantLights = this.isSunday && h >= LIGHTS_HOURS[0] && h < LIGHTS_HOURS[1];
    if (wantMarket && !this.market) this.openMarket();
    if (!wantMarket && this.market) this.closeMarket();
    if (wantLights && !this.lights) this.lightUp();
    if (!wantLights && this.lights) this.lightsOff();

    let music = 0;
    if (this.market) music = Math.max(music, this.tickMarket(time, delta) * 0.6);
    if (this.lights) music = Math.max(music, this.tickLights(time, h));
    this.scene.audio?.setFestival(music);
  }

  destroy(): void {
    if (this.market) this.closeMarket();
    if (this.lights) this.lightsOff();
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

  private openMarket(): void {
    const seg = this.segment();
    if (!seg) return;
    const scene = this.scene;
    scene.traffic.setClosedRoads(SUNDAY_CLOSED_ROADS);
    const rng = seededRng(mixSeed(scene.dayNight.dayCount, 7));
    const layer = scene.add.container(seg.a.x, seg.a.y).setRotation(seg.angle).setDepth(AWNING_DEPTH);
    const g = scene.add.graphics();
    layer.add(g);
    const start = MARKET_END_CLEAR_PX;
    const end = seg.len - MARKET_END_CLEAR_PX;

    // barriers across the whole road at both ends of the market
    for (const along of [start - 40, end + 40]) {
      for (let lat = -150; lat <= 70; lat += 22) {
        g.fillStyle(0xf07c2a).fillTriangle(along - 5, lat + 5, along + 5, lat + 5, along, lat - 7);
        g.fillStyle(0xffffff).fillRect(along - 3, lat - 1, 6, 2);
      }
    }

    const stalls: Stall[] = [];
    for (const side of STALL_LAT_PX) {
      for (let along = start; along <= end; along += STALL_SPACING_PX) {
        const kind = STALL_KINDS[Math.floor(rng() * STALL_KINDS.length)]!;
        const color = AWNINGS[Math.floor(rng() * AWNINGS.length)]!;
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
        stalls.push({ x: front.x, y: front.y, kind, dwellMs: 0, shooAt: -Infinity, vendor });
      }
    }

    const walkers: Walker[] = [];
    for (let i = 0; i < 18; i++) {
      const look = LOOKS[Math.floor(rng() * LOOKS.length)]!;
      const along = start + rng() * (end - start);
      const lat = (rng() - 0.5) * 34;
      const p = this.at(along, lat);
      walkers.push({ sprite: this.person(look, p.x, p.y, "E"), look, along, lat, dir: rng() < 0.5 ? 1 : -1, speed: 16 + rng() * 14, pauseMs: rng() * 3000 });
    }
    const bp = this.at(seg.len / 2, 100);
    const busker = this.person("teen", bp.x, bp.y, "N");

    this.market = { layer, stalls, walkers, busker, notesAt: 0 };
    // a few seeded finds in the aisle, gone when the market packs up
    const aisle: Pt[] = [];
    for (let along = start; along <= end; along += 12) aisle.push(this.at(along, (Math.sin(along) * 0.5) * 24));
    scene.forage?.setMarketSpots(aisle);

    if (this.narratedMarketDay !== scene.dayNight.dayCount) {
      this.narratedMarketDay = scene.dayNight.dayCount;
      this.narrate("Sunday. Paseo de Roxas is closed to cars: a street market, music, and the smell of grilled corn.");
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
    }
    const d = Phaser.Math.Distance.Between(player.x, player.y, m.busker.x, m.busker.y);
    return Math.max(0, 1 - d / MUSIC_RANGE_PX);
  }

  private closeMarket(): void {
    const m = this.market!;
    m.layer.destroy();
    for (const s of m.stalls) s.vendor.destroy();
    for (const w of m.walkers) w.sprite.destroy();
    m.busker.destroy();
    this.market = null;
    this.scene.forage?.setMarketSpots(null);
    this.scene.traffic.setClosedRoads([]);
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
    // projected butterflies drift round the fountain during the shows
    for (const b of L.butterflies) {
      b.a += b.s * 0.016 * (show ? 2 : 1);
      b.img.setPosition(L.sx + Math.cos(b.a) * b.r, L.sy + Math.sin(b.a * 1.3) * b.r * 0.6).setAlpha(show ? 0.9 * level : 0);
    }
    for (const p of L.crowd) p.setVisible(hour < 22);
    const { player } = this.scene;
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
