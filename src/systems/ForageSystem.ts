import Phaser from "phaser";
import type { GameScene } from "../scenes/GameScene";
import { placesOfType, type Pt } from "../utils/mapPlaces";
import {
  FORAGE_ITEMS,
  ITEM_BY_ID,
  TIER_POINTS,
  forageHungerAllowed,
  mixSeed,
  rollDay,
  rollMarket,
  seededRng,
  type DayTell,
  type ForageItem,
  type Habitat,
  type Tier,
} from "../utils/forage";

export const FORAGE_KEY = "FORAGE";
/** Market tells are numbered from here, clear of the daily slots. */
const MARKET_INDEX = 100;

/** Walking past, she notices a tell this close; crouched (nose down) a little further. */
const REVEAL_PX = 96;
const REVEAL_CROUCH_PX = 128;
/** A sniff reveals everything this close for {@link SNIFF_MS}, and points a scent trail at the nearest tell within {@link TRAIL_PX}. */
const SNIFF_PX = 220;
const SNIFF_MS = 8000;
const SNIFF_COOLDOWN_MS = 1200;
const TRAIL_PX = 640;
const PAW_PX = 28;
const DIG_PRESSES = 3;
/** Tells keep clear of feeding stations and bowls, so Space there still eats. */
const SOURCE_CLEAR_PX = 48;
const DOORSTEP_MIN_PX = 60;
const DOORSTEP_MAX_PX = 220;

const TIER_COLOR: Record<Tier, string> = { common: "#f0e8d0", uncommon: "#7ee07e", rare: "#ffd34d" };
const HAZARD_COLOR = "#ff8a65";

interface ForageState {
  seed: number;
  day: number;
  /** Slot indices found (or backed away from) today. */
  found: number[];
  hungerToday: number;
  /** Item ids ever found: the Journal's Field notes and treasure box. */
  notes: string[];
  finds: number;
  doorstep?: Pt;
}

interface LiveTell extends DayTell {
  item: ForageItem;
  x: number;
  y: number;
  revealed: boolean;
  digs: number;
  glyph?: Phaser.GameObjects.Text;
}

function sanitize(raw: unknown): ForageState | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.seed !== "number" || !Number.isFinite(r.seed)) return null;
  const nums = (v: unknown) => (Array.isArray(v) ? v.filter((n): n is number => Number.isInteger(n) && n >= 0) : []);
  const pt = r.doorstep as Record<string, unknown> | undefined;
  return {
    seed: r.seed >>> 0,
    day: Number.isInteger(r.day) ? (r.day as number) : 0,
    found: nums(r.found),
    hungerToday: typeof r.hungerToday === "number" && r.hungerToday >= 0 ? r.hungerToday : 0,
    notes: Array.isArray(r.notes) ? r.notes.filter((id): id is string => typeof id === "string" && ITEM_BY_ID.has(id)) : [],
    finds: Number.isInteger(r.finds) && (r.finds as number) >= 0 ? (r.finds as number) : 0,
    doorstep: pt && typeof pt.x === "number" && typeof pt.y === "number" ? { x: pt.x, y: pt.y } : undefined,
  };
}

/**
 * Hunt and sniff: each in-game day hides 24 seeded tells around the park (bugs in the shrubs, crusts
 * under the benches at dawn, moths at the lamps, treasure under the trees). She notices one when she
 * passes close (closer still crouched), or sniffs (Space with nobody to greet) to find them; Space
 * beside one paws it (or digs, three times, where the earth is disturbed).
 */
export class ForageSystem {
  private state: ForageState;
  private tells: LiveTell[] = [];
  private cells: Record<Habitat, Pt[]> | null = null;
  private sniffUntil = 0;
  private lastSniff = -Infinity;
  private seenATell = false;

  constructor(private readonly scene: GameScene) {
    this.state = sanitize(scene.registry.get(FORAGE_KEY)) ?? {
      seed: Math.floor(Math.random() * 2 ** 32),
      day: 0,
      found: [],
      hungerToday: 0,
      notes: [],
      finds: 0,
    };
    this.seenATell = this.state.finds > 0;
  }

  /** Lay out today's tells (call once the map, player and food sources exist, and on every new day). */
  startDay(day: number): void {
    if (day !== this.state.day) {
      this.state = { ...this.state, day, found: [], hungerToday: 0, doorstep: undefined };
    }
    for (const t of this.tells) t.glyph?.destroy();
    this.tells = rollDay(this.state.seed, day)
      .filter((t) => !this.state.found.includes(t.index))
      .map((t) => this.place(t))
      .filter((t): t is LiveTell => t !== null);
    this.persist();
  }

  update(time: number): void {
    const { player, dayNight } = this.scene;
    if (!player?.active) return;
    const phase = dayNight.currentPhase;
    const radius = player.isCrouching ? REVEAL_CROUCH_PX : REVEAL_PX;
    for (const t of this.tells) {
      const inWindow = t.item.phases.includes(phase);
      if (!t.revealed && inWindow) {
        const d = Phaser.Math.Distance.Between(player.x, player.y, t.x, t.y);
        if (d <= radius || (time < this.sniffUntil && d <= SNIFF_PX)) this.reveal(t);
      }
      t.glyph?.setVisible(t.revealed && inWindow);
    }
  }

  /** Space beside a revealed tell: paw it (or dig). False when there is none in reach. */
  tryPaw(): boolean {
    const { player, dayNight } = this.scene;
    let best: LiveTell | null = null;
    let bestD = PAW_PX;
    for (const t of this.tells) {
      if (!t.revealed || !t.item.phases.includes(dayNight.currentPhase)) continue;
      const d = Phaser.Math.Distance.Between(player.x, player.y, t.x, t.y);
      if (d <= bestD) {
        best = t;
        bestD = d;
      }
    }
    if (!best) return false;
    player.faceToward(best.x, best.y);
    if (best.buried && ++best.digs < DIG_PRESSES) {
      player.startGreeting();
      this.dirtPuff(best.x, best.y);
      this.floatText(best.x, best.y - 10, best.digs === 1 ? "dig…" : "dig, dig…", "#c8a070", 10);
      return true;
    }
    this.collect(best);
    return true;
  }

  /** Space with nobody to greet: a sniff. Reveals what's near and draws a faint scent trail to the nearest thing beyond. */
  sniff(time: number): void {
    if (time - this.lastSniff < SNIFF_COOLDOWN_MS) return;
    this.lastSniff = time;
    this.sniffUntil = time + SNIFF_MS;
    const { player, dayNight } = this.scene;
    const reduced = this.scene.registry.get("MOTION_REDUCED") === true;
    const ring = this.scene.add.circle(player.x, player.y, 8).setStrokeStyle(1.5, 0xf0e8d0, 0.6).setDepth(12);
    if (reduced) this.scene.time.delayedCall(400, () => ring.destroy());
    else this.scene.tweens.add({ targets: ring, radius: SNIFF_PX, alpha: 0, duration: 900, ease: "Sine.easeOut", onComplete: () => ring.destroy() });

    const phase = dayNight.currentPhase;
    const hidden = this.tells
      .filter((t) => !t.revealed && t.item.phases.includes(phase))
      .map((t) => ({ t, d: Phaser.Math.Distance.Between(player.x, player.y, t.x, t.y) }))
      .filter(({ d }) => d > SNIFF_PX && d <= TRAIL_PX)
      .sort((a, b) => a.d - b.d);
    const near = hidden[0];
    if (!near) return;
    const angle = Phaser.Math.Angle.Between(player.x, player.y, near.t.x, near.t.y);
    for (let i = 1; i <= 4; i++) {
      const dot = this.scene.add
        .circle(player.x + Math.cos(angle) * (18 + i * 16), player.y + Math.sin(angle) * (18 + i * 16), 1.6, 0xf0e8d0, 0.8)
        .setDepth(12);
      this.scene.tweens.add({ targets: dot, alpha: 0, delay: i * 120, duration: 1400, onComplete: () => dot.destroy() });
    }
  }

  /**
   * The Sunday market's aisle (world points along closed Paseo de Roxas), or null when it packs up:
   * a few seeded tells there, gone with the market.
   */
  setMarketSpots(aisle: Pt[] | null, count = 6): void {
    for (const t of this.tells) if (t.index >= MARKET_INDEX) t.glyph?.destroy();
    this.tells = this.tells.filter((t) => t.index < MARKET_INDEX);
    if (!aisle || aisle.length === 0) return;
    rollMarket(this.state.seed, this.state.day, count).forEach(({ itemId, spot }, i) => {
      const index = MARKET_INDEX + i;
      const item = ITEM_BY_ID.get(itemId);
      const at = aisle[Math.floor(spot * aisle.length)];
      if (!item || !at || this.state.found.includes(index)) return;
      this.tells.push({ index, habitat: "market", buried: false, itemId, spot, item, x: at.x, y: at.y, revealed: false, digs: 0 });
    });
  }

  /** For the Journal: everything ever found, in table order, plus how many there are to find. */
  fieldNotes(): { found: ForageItem[]; total: number; treasures: ForageItem[]; treasureTotal: number; sunday: ForageItem[]; sundayTotal: number } {
    const notes = new Set(this.state.notes);
    const daily = FORAGE_ITEMS.filter((i) => !i.habitats.includes("market"));
    const sunday = FORAGE_ITEMS.filter((i) => i.habitats.includes("market"));
    return {
      found: daily.filter((i) => !i.treasure && notes.has(i.id)),
      total: daily.filter((i) => !i.treasure).length,
      treasures: daily.filter((i) => i.treasure && notes.has(i.id)),
      treasureTotal: daily.filter((i) => i.treasure).length,
      sunday: sunday.filter((i) => notes.has(i.id)),
      sundayTotal: sunday.length,
    };
  }

  private collect(t: LiveTell): void {
    const { player, stats, scoring } = this.scene;
    const item = t.item;
    t.glyph?.destroy();
    this.tells = this.tells.filter((x) => x !== t);
    this.state.found.push(t.index);
    const firstTime = !this.state.notes.includes(item.id);
    if (firstTime) this.state.notes.push(item.id);
    this.state.finds++;

    let gain = "";
    if (item.hazard) {
      player.startle();
      this.scene.emotes.show(this.scene, player, "alert");
    } else {
      const hunger = item.hunger ? forageHungerAllowed(this.state.hungerToday, item.hunger) : 0;
      if (hunger > 0) {
        this.state.hungerToday += stats.restore("hunger", hunger);
        gain = ` +${hunger}`;
        player.startConsuming();
      } else {
        player.startGreeting();
        if (item.hunger) gain = " (not hungry)";
      }
      if (item.energy) stats.restore("energy", item.energy);
      if (item.thirst) stats.restore("thirst", item.thirst);
      if (item.tier !== "common" || item.treasure) this.scene.emotes.show(this.scene, player, "heart");
    }
    const points = item.hazard ? 5 : TIER_POINTS[item.tier] * (item.treasure ? 2 : 1);
    scoring.recordFind(points);
    if (item.tier === "rare" && !item.hazard) this.scene.audio.playMeow();

    const color = item.hazard ? HAZARD_COLOR : TIER_COLOR[item.tier];
    const star = item.hazard ? "⚠ " : item.tier === "rare" ? "★ " : item.tier === "uncommon" ? "✦ " : "";
    this.floatText(t.x, t.y - 12, `${star}${item.emoji} ${item.name}${gain}`, color, item.tier === "rare" ? 13 : 11);
    this.floatText(t.x, t.y + 2, item.verdict, "#e8e0c8", 9, 400);
    if (firstTime) this.floatText(t.x, t.y + 14, `New field note · +${points}`, color, 8, 700);
    if (item.tier === "rare" && this.scene.registry.get("MOTION_REDUCED") !== true) this.sparkle(t.x, t.y);

    this.persist();
    if (item.tier === "rare" || item.treasure) this.scene.autoSave();
  }

  private reveal(t: LiveTell): void {
    t.revealed = true;
    const glyph = this.scene.add
      .text(t.x, t.y, t.buried ? "∴" : "✧", {
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: t.buried ? "12px" : "11px",
        color: t.buried ? "#c8a070" : "#f6f0d8",
        stroke: "#000000",
        strokeThickness: 2,
        resolution: 2,
      })
      .setOrigin(0.5)
      .setDepth(12);
    t.glyph = glyph;
    if (this.scene.registry.get("MOTION_REDUCED") !== true) {
      this.scene.tweens.add({ targets: glyph, alpha: 0.35, yoyo: true, repeat: -1, duration: 700, ease: "Sine.easeInOut" });
    }
    this.scene.emotes.show(this.scene, this.scene.player, "curious");
    if (!this.seenATell) {
      this.seenATell = true;
      this.floatText(t.x, t.y - 14, t.buried ? "Space: dig" : "Space: paw", "#f0e8d0", 10, 0, 2600);
    }
  }

  private place(t: DayTell): LiveTell | null {
    // a brand-new forager's first find is always a beetle: crunchy, edible, nothing to learn the hard way
    const item = ITEM_BY_ID.get(t.index === 0 && this.state.finds === 0 ? "beetle" : t.itemId);
    if (!item) return null;
    const cells = this.habitatCells()[t.habitat];
    let spot: Pt | undefined;
    if (t.index === 0) spot = this.doorstep(item);
    spot ??= cells[Math.floor(t.spot * cells.length)];
    if (!spot) return null;
    return { ...t, item, x: spot.x, y: spot.y, revealed: false, digs: 0 };
  }

  /** The day's first tell lands near her the first time the day is played, so a session opens on a find. */
  private doorstep(item: ForageItem): Pt | undefined {
    if (this.state.doorstep) return this.state.doorstep;
    const { player } = this.scene;
    if (!player) return undefined;
    const all = this.habitatCells();
    const near = item.habitats
      .flatMap((h) => all[h])
      .map((p) => ({ p, d: Phaser.Math.Distance.Between(player.x, player.y, p.x, p.y) }))
      .filter(({ d }) => d >= DOORSTEP_MIN_PX && d <= DOORSTEP_MAX_PX)
      .sort((a, b) => Math.abs(a.d - 90) - Math.abs(b.d - 90));
    const pick = near[0]?.p;
    if (pick) this.state.doorstep = { ...pick };
    return pick;
  }

  private habitatCells(): Record<Habitat, Pt[]> {
    if (this.cells) return this.cells;
    const { map, groundLayer, objectsLayer, overheadLayer, places } = this.scene;
    const ts = map.tileWidth;
    const sources = this.scene.foodSourcePositions();
    const plants = map.getTileset("plants");
    const parkTiles = map.getTileset("park-tiles");
    const grass = new Set([0, 1, 24, 32].map((id) => (parkTiles?.firstgid ?? 1) + id));
    const leafy = (x: number, y: number) => (overheadLayer?.getTileAt(x, y)?.index ?? -1) > 0;
    const clear = (x: number, y: number) => !groundLayer?.getTileAt(x, y)?.collides && !objectsLayer?.getTileAt(x, y)?.collides;
    const centre = (x: number, y: number): Pt => ({ x: x * ts + ts / 2, y: y * ts + ts / 2 });
    const ok = (p: Pt) =>
      this.scene.isInPark(p.x, p.y) && sources.every((s) => Phaser.Math.Distance.Between(p.x, p.y, s.x, s.y) >= SOURCE_CLEAR_PX);
    const near = (types: string[], r: number) => {
      const anchors = types.flatMap((ty) => placesOfType(places, ty));
      const out: Pt[] = [];
      for (const a of anchors) {
        const cx = Math.floor(a.x / ts);
        const cy = Math.floor(a.y / ts);
        const span = Math.ceil(r / ts);
        for (let y = cy - span; y <= cy + span; y++)
          for (let x = cx - span; x <= cx + span; x++) {
            const p = centre(x, y);
            if (clear(x, y) && Phaser.Math.Distance.Between(p.x, p.y, a.x, a.y) <= r) out.push(p);
          }
      }
      return out;
    };

    const shrub: Pt[] = [];
    const shade: Pt[] = [];
    const lawn: Pt[] = [];
    for (let y = 1; y < map.height - 1; y++)
      for (let x = 1; x < map.width - 1; x++) {
        const obj = objectsLayer?.getTileAt(x, y)?.index ?? -1;
        if (plants && obj >= plants.firstgid + 128 && obj < plants.firstgid + plants.total) shrub.push(centre(x, y));
        if (!clear(x, y)) continue;
        if (leafy(x, y) && leafy(x - 1, y) && leafy(x + 1, y) && leafy(x, y - 1) && leafy(x, y + 1)) shade.push(centre(x, y));
        else if (!leafy(x, y) && grass.has(groundLayer?.getTileAt(x, y)?.index ?? -1)) lawn.push(centre(x, y));
      }
    // a stable shuffle, so a seeded index lands anywhere in the park rather than in the north-west corner
    const shuffle = (pts: Pt[], salt: number) => {
      const rng = seededRng(mixSeed(this.state.seed, salt));
      for (let i = pts.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [pts[i], pts[j]] = [pts[j]!, pts[i]!];
      }
      return pts;
    };
    this.cells = {
      shrub: shuffle(shrub.filter(ok), 11),
      shade: shuffle(shade.filter(ok), 12),
      table: shuffle(near(["dining", "picnic", "bench"], 48).filter(ok), 13),
      lamp: shuffle(near(["lamp"], 40).filter(ok), 14),
      lawn: shuffle(lawn.filter(ok), 15),
      market: [],
    };
    return this.cells;
  }

  private persist(): void {
    this.scene.registry.set(FORAGE_KEY, { ...this.state, found: [...this.state.found], notes: [...this.state.notes] });
  }

  private floatText(x: number, y: number, text: string, color: string, size: number, delay = 0, life = 1600): void {
    const ft = this.scene.add
      .text(x, y, text, {
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: `${size}px`,
        color,
        stroke: "#000000",
        strokeThickness: 2,
        fontStyle: "bold",
        resolution: 2,
      })
      .setOrigin(0.5)
      .setDepth(100)
      .setAlpha(delay > 0 ? 0 : 1);
    const reduced = this.scene.registry.get("MOTION_REDUCED") === true;
    this.scene.tweens.add({
      targets: ft,
      alpha: { from: 1, to: 0 },
      y: reduced ? y : y - 26,
      delay,
      duration: life,
      ease: "Cubic.easeIn",
      onComplete: () => ft.destroy(),
    });
    if (!reduced && size >= 11) this.scene.tweens.add({ targets: ft, scale: { from: 0.6, to: 1 }, delay, duration: 220, ease: "Back.easeOut" });
  }

  private dirtPuff(x: number, y: number): void {
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2;
      const dot = this.scene.add.circle(x, y, 1.5, 0x8b6a45).setDepth(12);
      this.scene.tweens.add({ targets: dot, x: x + Math.cos(a) * 10, y: y + Math.sin(a) * 6 - 4, alpha: 0, duration: 450, onComplete: () => dot.destroy() });
    }
  }

  private sparkle(x: number, y: number): void {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const s = this.scene.add.text(x, y, "✦", { fontSize: "8px", color: "#ffd34d", resolution: 2 }).setOrigin(0.5).setDepth(100);
      this.scene.tweens.add({ targets: s, x: x + Math.cos(a) * 28, y: y + Math.sin(a) * 22, alpha: 0, duration: 900, ease: "Cubic.easeOut", onComplete: () => s.destroy() });
    }
  }
}
